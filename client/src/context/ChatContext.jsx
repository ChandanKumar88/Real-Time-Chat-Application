import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { decryptText, encryptText, ensureLocalKeyPair, getLocalKeyPair } from "../utils/e2ee";

const ChatContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const USERS_POLL_INTERVAL_MS = 8000;
const MESSAGES_POLL_INTERVAL_MS = 3000;
const PRESENCE_PING_INTERVAL_MS = 20000;
const TYPING_STOP_DELAY_MS = 1200;
const TYPING_STALE_MS = 4000;
const TYPING_POLL_INTERVAL_MS = 1000;
const TYPING_HTTP_THROTTLE_MS = 1500;

export function ChatProvider({ children }) {
  const { user, setUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const selectedUserRef = useRef(null);
  const usersRef = useRef([]);
  const onlineUserIdsRef = useRef(new Set());
  const typingStopTimersRef = useRef({});
  const typingStaleTimersRef = useRef({});
  const typingHttpSentAtRef = useRef({});

  const decryptMessage = useCallback(
    async (message, peerUser = selectedUserRef.current) => {
      if (!message?.encryptedPayload || !user?._id) return message;

      const senderId = message.senderId?.toString?.() || message.senderId;
      const receiverId = message.receiverId?.toString?.() || message.receiverId;
      const peerId = senderId === user._id ? receiverId : senderId;
      const freshPeer = usersRef.current.find((u) => u._id === peerId);
      const text = await decryptText({
        encryptedPayload: message.encryptedPayload,
        myUserId: user._id,
        peerPublicKey: freshPeer?.publicKey || peerUser?.publicKey,
      });

      if (text === null) {
        return { ...message, text: "", decryptionFailed: true };
      }

      return { ...message, text, decryptionFailed: false };
    },
    [user?._id]
  );

  const decryptMessages = useCallback(
    async (rawMessages, peerUser = selectedUserRef.current) =>
      Promise.all((rawMessages || []).map((message) => decryptMessage(message, peerUser))),
    [decryptMessage]
  );

  useEffect(() => {
    async function publishEncryptionKey() {
      if (!user?._id) return;

      try {
        const savedKeyPair = getLocalKeyPair(user._id);
        if (user.publicKey && savedKeyPair?.publicKey !== user.publicKey) return;

        const localKeyPair = savedKeyPair || (user.publicKey ? null : await ensureLocalKeyPair(user._id));
        if (!localKeyPair) return;
        if (user.publicKey === localKeyPair.publicKey) return;

        const { data } = await api.patch("/users/encryption-key", { publicKey: localKeyPair.publicKey });
        setUser(data.data);
      } catch {
        // Without a key, new encrypted messages will be blocked instead of sent as plaintext.
      }
    }

    publishEncryptionKey();
  }, [setUser, user?._id, user?.publicKey]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    if (!selectedUser) return;

    const freshSelectedUser = users.find((u) => u._id === selectedUser._id);
    if (!freshSelectedUser) return;

    setSelectedUser((prev) => {
      if (!prev || prev._id !== freshSelectedUser._id) return prev;
      if (
        prev.isOnline === freshSelectedUser.isOnline &&
        prev.fullName === freshSelectedUser.fullName &&
        prev.profilePic === freshSelectedUser.profilePic &&
        prev.bio === freshSelectedUser.bio &&
        prev.publicKey === freshSelectedUser.publicKey
      ) {
        return prev;
      }
      return { ...prev, ...freshSelectedUser };
    });
  }, [users, selectedUser]);

  useEffect(() => {
    if (!user) return;
    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    const announceOnline = () => {
      s.emit("user:online", user._id);
      api.patch("/users/presence/online").catch(() => null);
    };

    s.on("connect", announceOnline);
    s.io.on("reconnect", announceOnline);
    s.on("presence:update", (onlineIds) => {
      onlineUserIdsRef.current = new Set(onlineIds);
      setUsers((prev) => prev.map((u) => ({ ...u, isOnline: onlineIds.includes(u._id) })));
      setSelectedUser((prev) => (prev ? { ...prev, isOnline: onlineIds.includes(prev._id) } : prev));
    });
    s.on("message:new", (message) => {
      if (selectedUserRef.current && message.senderId === selectedUserRef.current._id) {
        decryptMessage(message, selectedUserRef.current).then((decryptedMessage) => {
          setMessages((prev) => [...prev, decryptedMessage]);
        });
        setUsers((prev) => prev.map((u) => (u._id === message.senderId ? { ...u, unreadCount: 0 } : u)));
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u._id === message.senderId ? { ...u, unreadCount: (u.unreadCount || 0) + 1 } : u))
      );
    });
    s.on("message:seen", (seenMessage) => {
      decryptMessage(seenMessage, selectedUserRef.current).then((decryptedMessage) => {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === seenMessage._id ? { ...decryptedMessage, text: m.text || decryptedMessage.text } : m
          )
        );
      });
    });
    s.on("message:deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });
    s.on("typing:update", ({ userId, isTyping }) => {
      if (!userId) return;

      window.clearTimeout(typingStaleTimersRef.current[userId]);
      setTypingUsers((prev) => ({ ...prev, [userId]: Boolean(isTyping) }));

      if (isTyping) {
        typingStaleTimersRef.current[userId] = window.setTimeout(() => {
          setTypingUsers((prev) => ({ ...prev, [userId]: false }));
        }, TYPING_STALE_MS);
      }
    });
    setSocket(s);
    const pingInterval = window.setInterval(() => {
      if (s.connected) s.emit("presence:ping", user._id);
      api.patch("/users/presence/online").catch(() => null);
    }, PRESENCE_PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", announceOnline);
    const typingStopTimers = typingStopTimersRef.current;
    const typingStaleTimers = typingStaleTimersRef.current;

    return () => {
      window.clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", announceOnline);
      s.io.off("reconnect", announceOnline);
      Object.values(typingStopTimers).forEach(window.clearTimeout);
      Object.values(typingStaleTimers).forEach(window.clearTimeout);
      s.disconnect();
    };
  }, [user, decryptMessage]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      loadUsers().catch(() => null);
    }, USERS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (!user || !selectedUser) return;

    const intervalId = window.setInterval(async () => {
      try {
        const activeUserId = selectedUserRef.current?._id;
        if (!activeUserId) return;

        const { data } = await api.get(`/messages/${activeUserId}`);
        const decryptedMessages = await decryptMessages(data.data || [], selectedUserRef.current);
        setMessages((prev) => {
          const nextMessages = decryptedMessages;
          if (JSON.stringify(prev) === JSON.stringify(nextMessages)) {
            return prev;
          }
          return nextMessages;
        });
        setUsers((prev) => prev.map((u) => (u._id === activeUserId ? { ...u, unreadCount: 0 } : u)));
      } catch {
        // Keep silent here; socket or next poll may recover automatically.
      }
    }, MESSAGES_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [user, selectedUser, decryptMessages]);

  useEffect(() => {
    if (!user || !selectedUser) return;

    const intervalId = window.setInterval(async () => {
      try {
        const activeUserId = selectedUserRef.current?._id;
        if (!activeUserId) return;

        const { data } = await api.get(`/users/typing/${activeUserId}`);
        setTypingUsers((prev) => ({ ...prev, [activeUserId]: Boolean(data.data?.isTyping) }));
      } catch {
        // Socket typing may still work; keep this fallback quiet.
      }
    }, TYPING_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [user, selectedUser]);

  async function loadUsers() {
    const { data } = await api.get("/users");
    setUsers(data.data.map((u) => ({ ...u, isOnline: Boolean(u.isOnline) || onlineUserIdsRef.current.has(u._id) })));
  }

  async function loadMessages(userId) {
    if (!userId) {
      setMessages([]);
      return [];
    }

    const { data } = await api.get(`/messages/${userId}`);
    const peerUser = users.find((u) => u._id === userId) || selectedUserRef.current;
    const decryptedMessages = await decryptMessages(data.data, peerUser);
    setMessages(decryptedMessages);
    setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, unreadCount: 0 } : u)));
    return decryptedMessages;
  }

  async function sendMessage(targetUserId, payload) {
    const targetUser = users.find((u) => u._id === targetUserId) || selectedUserRef.current;
    const localKeyPair = getLocalKeyPair(user._id);
    if (payload.text && user.publicKey && localKeyPair?.publicKey !== user.publicKey) {
      throw new Error("Encrypted chat key backup original browser se create karo.");
    }

    const encryptedPayload = payload.text
      ? await encryptText({ text: payload.text, myUserId: user._id, peerPublicKey: targetUser?.publicKey })
      : "";
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      senderId: user._id,
      receiverId: targetUserId,
      text: payload.text || "",
      encryptedPayload,
      encrypted: Boolean(encryptedPayload),
      encryptionVersion: encryptedPayload ? 1 : 0,
      image: payload.image || "",
      video: payload.video || "",
      seen: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data } = await api.post(`/messages/${targetUserId}`, { ...payload, text: "", encryptedPayload });
      const decryptedMessage = await decryptMessage(data.data, targetUser);
      setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...decryptedMessage, text: payload.text || decryptedMessage.text } : m)));
      return decryptedMessage;
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      throw error;
    }
  }

  async function markSeen(messageId) {
    await api.patch(`/messages/${messageId}/seen`);
  }

  async function deleteMessage(messageId) {
    await api.delete(`/messages/${messageId}`);
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }

  function emitTyping(receiverId) {
    if (!receiverId || !user?._id) return;

    socket?.emit("typing:start", { senderId: user._id, receiverId });
    const now = Date.now();
    if (!typingHttpSentAtRef.current[receiverId] || now - typingHttpSentAtRef.current[receiverId] > TYPING_HTTP_THROTTLE_MS) {
      typingHttpSentAtRef.current[receiverId] = now;
      api.patch("/users/typing", { receiverId, isTyping: true }).catch(() => null);
    }
    window.clearTimeout(typingStopTimersRef.current[receiverId]);
    typingStopTimersRef.current[receiverId] = window.setTimeout(() => {
      socket?.emit("typing:stop", { senderId: user._id, receiverId });
      api.patch("/users/typing", { receiverId, isTyping: false }).catch(() => null);
      typingHttpSentAtRef.current[receiverId] = 0;
    }, TYPING_STOP_DELAY_MS);
  }

  function stopTyping(receiverId) {
    if (!receiverId || !user?._id) return;

    window.clearTimeout(typingStopTimersRef.current[receiverId]);
    socket?.emit("typing:stop", { senderId: user._id, receiverId });
    api.patch("/users/typing", { receiverId, isTyping: false }).catch(() => null);
    typingHttpSentAtRef.current[receiverId] = 0;
  }

  const value = useMemo(
    () => ({
      users,
      selectedUser,
      setSelectedUser,
      loadUsers,
      loadMessages,
      messages,
      sendMessage,
      markSeen,
      deleteMessage,
      socket,
      setUsers,
      typingUsers,
      emitTyping,
      stopTyping,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, selectedUser, messages, socket, typingUsers]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => useContext(ChatContext);
