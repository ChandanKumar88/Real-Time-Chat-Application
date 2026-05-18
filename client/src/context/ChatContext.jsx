import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { decryptText, encryptText, ensureLocalKeyPair, getLocalKeyPair } from "../utils/e2ee";

const ChatContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const USERS_POLL_INTERVAL_MS = 8000;
const MESSAGES_POLL_INTERVAL_MS = 900;
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
  const [messagesCache, setMessagesCache] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const selectedUserRef = useRef(null);
  const usersRef = useRef([]);
  const messagesCacheRef = useRef({});
  const onlineUserIdsRef = useRef(new Set());
  const typingStopTimersRef = useRef({});
  const typingStaleTimersRef = useRef({});
  const typingHttpSentAtRef = useRef({});
  const messagesPollInFlightRef = useRef(false);
  const messagesAbortRef = useRef(null);
  const messagesRequestIdRef = useRef(0);

  const decryptMessage = useCallback(
    async (message, peerUser = selectedUserRef.current) => {
      if (!message?.encryptedPayload || !user?._id) return message;

      const senderId = message.senderId?.toString?.() || message.senderId;
      const receiverId = message.receiverId?.toString?.() || message.receiverId;
      const peerId = senderId === user._id ? receiverId : senderId;
      const freshPeer = usersRef.current.find((u) => u._id === peerId);
      const messagePeerPublicKey = senderId === user._id ? message.receiverPublicKey : message.senderPublicKey;
      const text = await decryptText({
        encryptedPayload: message.encryptedPayload,
        myUserId: user._id,
        peerPublicKey: messagePeerPublicKey || freshPeer?.publicKey || peerUser?.publicKey,
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

  const updateConversationMessages = useCallback((peerId, updater, syncActive = true) => {
    if (!peerId) return;

    let nextMessages = [];
    setMessagesCache((prev) => {
      const currentMessages = prev[peerId] || [];
      nextMessages = typeof updater === "function" ? updater(currentMessages) : updater;
      const nextCache = { ...prev, [peerId]: nextMessages };
      messagesCacheRef.current = nextCache;
      return nextCache;
    });

    if (syncActive && selectedUserRef.current?._id === peerId) {
      setMessages((prev) => (typeof updater === "function" ? updater(prev) : nextMessages));
    }
  }, []);

  const removeMessageFromCache = useCallback((messageId) => {
    if (!messageId) return;

    setMessagesCache((prev) => {
      const nextCache = Object.fromEntries(
        Object.entries(prev).map(([peerId, cachedMessages]) => [
          peerId,
          cachedMessages.filter((message) => message._id !== messageId),
        ])
      );
      messagesCacheRef.current = nextCache;
      return nextCache;
    });
    setMessages((prev) => prev.filter((message) => message._id !== messageId));
  }, []);

  function getMessagePeerId(message) {
    if (!message || !user?._id) return "";
    const senderId = message.senderId?.toString?.() || message.senderId;
    const receiverId = message.receiverId?.toString?.() || message.receiverId;
    return senderId === user._id ? receiverId : senderId;
  }

  useEffect(() => {
    async function publishEncryptionKey() {
      if (!user?._id) return;
      if (user.encryptionPassphraseRequired) return;

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
  }, [setUser, user?._id, user?.publicKey, user?.encryptionPassphraseRequired]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    messagesCacheRef.current = messagesCache;
  }, [messagesCache]);

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
    if (!user || user.encryptionPassphraseRequired) return;
    const s = io(SOCKET_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    const announceOnline = () => {
      s.emit("user:online", user._id);
      api.patch("/users/presence/online").catch(() => null);
    };
    const handleConnect = () => {
      setSocketConnected(true);
      announceOnline();
    };
    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("connect_error", handleDisconnect);
    s.io.on("reconnect", announceOnline);
    s.on("presence:update", (onlineIds) => {
      onlineUserIdsRef.current = new Set(onlineIds);
      setUsers((prev) => prev.map((u) => ({ ...u, isOnline: onlineIds.includes(u._id) })));
      setSelectedUser((prev) => (prev ? { ...prev, isOnline: onlineIds.includes(prev._id) } : prev));
    });
    s.on("message:new", (message) => {
      const peerId = getMessagePeerId(message);
      const peerUser = usersRef.current.find((item) => item._id === peerId) || selectedUserRef.current;

      decryptMessage(message, peerUser).then((decryptedMessage) => {
        updateConversationMessages(peerId, (prev) => {
          const withoutDuplicate = prev.filter((item) => item._id !== decryptedMessage._id);
          return [...withoutDuplicate, decryptedMessage].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
      });

      if (selectedUserRef.current && peerId === selectedUserRef.current._id) {
        setUsers((prev) => prev.map((u) => (u._id === peerId ? { ...u, unreadCount: 0 } : u)));
        return;
      }

      setUsers((prev) => prev.map((u) => (u._id === peerId ? { ...u, unreadCount: (u.unreadCount || 0) + 1 } : u)));
    });
    s.on("message:seen", (seenMessage) => {
      const peerId = getMessagePeerId(seenMessage);
      decryptMessage(seenMessage, selectedUserRef.current).then((decryptedMessage) => {
        updateConversationMessages(peerId, (prev) =>
          prev.map((m) =>
            m._id === seenMessage._id ? { ...decryptedMessage, text: m.text || decryptedMessage.text } : m
          )
        );
      });
    });
    s.on("message:deleted", ({ messageId }) => {
      removeMessageFromCache(messageId);
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
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("connect_error", handleDisconnect);
      s.io.off("reconnect", announceOnline);
      Object.values(typingStopTimers).forEach(window.clearTimeout);
      Object.values(typingStaleTimers).forEach(window.clearTimeout);
      s.disconnect();
      setSocketConnected(false);
      setSocket(null);
    };
  }, [user, decryptMessage]);

  useEffect(() => {
    if (!user || user.encryptionPassphraseRequired) return;

    const intervalId = window.setInterval(() => {
      loadUsers().catch(() => null);
    }, USERS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (!user || user.encryptionPassphraseRequired || !selectedUser) return;

    async function refreshActiveConversation() {
      if (messagesPollInFlightRef.current) return;
      messagesPollInFlightRef.current = true;
      try {
        const activeUserId = selectedUserRef.current?._id;
        if (!activeUserId) return;

        const { data } = await api.get(`/messages/${activeUserId}`);
        const decryptedMessages = await decryptMessages(data.data || [], selectedUserRef.current);
        updateConversationMessages(activeUserId, (prev) => {
          const pendingMessages = prev.filter((message) => message.pending);
          const nextMessages = [...decryptedMessages, ...pendingMessages];
          if (JSON.stringify(prev) === JSON.stringify(nextMessages)) return prev;
          return nextMessages;
        });
        setUsers((prev) => prev.map((u) => (u._id === activeUserId ? { ...u, unreadCount: 0 } : u)));
      } catch {
        // Keep silent here; socket or next poll may recover automatically.
      } finally {
        messagesPollInFlightRef.current = false;
      }
    }

    const intervalId = window.setInterval(refreshActiveConversation, MESSAGES_POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshActiveConversation);
    document.addEventListener("visibilitychange", refreshActiveConversation);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshActiveConversation);
      document.removeEventListener("visibilitychange", refreshActiveConversation);
    };
  }, [user, selectedUser, decryptMessages, updateConversationMessages]);

  useEffect(() => {
    if (!user || user.encryptionPassphraseRequired || !selectedUser) return;

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

  async function loadMessages(userId, options = {}) {
    if (!userId) {
      messagesAbortRef.current?.abort();
      setMessages([]);
      setMessagesLoading(false);
      return [];
    }

    const { signal, requestId, showLoader = true, peerUser: requestedPeerUser } = options;
    if (showLoader) setMessagesLoading(true);

    try {
      const { data } = await api.get(`/messages/${userId}`, signal ? { signal } : undefined);
      if (requestId && requestId !== messagesRequestIdRef.current) return [];

      const peerUser = requestedPeerUser || usersRef.current.find((u) => u._id === userId) || selectedUserRef.current;
      const decryptedMessages = await decryptMessages(data.data, peerUser);
      if (requestId && requestId !== messagesRequestIdRef.current) return [];

      updateConversationMessages(userId, decryptedMessages);
      if (selectedUserRef.current?._id === userId) {
        setMessagesLoading(false);
      }
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, unreadCount: 0 } : u)));
      return decryptedMessages;
    } catch (error) {
      if (selectedUserRef.current?._id === userId) {
        setMessagesLoading(false);
      }
      throw error;
    }
  }

  function selectUser(nextUser) {
    if (!nextUser?._id) {
      messagesAbortRef.current?.abort();
      messagesRequestIdRef.current += 1;
      selectedUserRef.current = null;
      setSelectedUser(null);
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    if (selectedUserRef.current?._id === nextUser._id) return;

    messagesAbortRef.current?.abort();
    const cachedMessages = messagesCacheRef.current[nextUser._id];
    const requestId = messagesRequestIdRef.current + 1;
    const abortController = new AbortController();

    messagesRequestIdRef.current = requestId;
    messagesAbortRef.current = abortController;
    selectedUserRef.current = nextUser;
    setSelectedUser(nextUser);
    setMessages(cachedMessages || []);
    setMessagesLoading(!cachedMessages);
    setUsers((prev) => prev.map((u) => (u._id === nextUser._id ? { ...u, unreadCount: 0 } : u)));

    loadMessages(nextUser._id, {
      signal: abortController.signal,
      requestId,
      showLoader: !cachedMessages,
      peerUser: nextUser,
    }).catch((error) => {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || abortController.signal.aborted) return;
      if (selectedUserRef.current?._id === nextUser._id) setMessagesLoading(false);
    });
  }

  async function sendMessage(targetUserId, payload) {
    if (user.encryptionPassphraseRequired) {
      throw new Error("Chat recovery passphrase enter karke encrypted chats unlock karo.");
    }

    const targetUser = users.find((u) => u._id === targetUserId) || selectedUserRef.current;
    const localKeyPair = getLocalKeyPair(user._id);
    if (payload.text && user.publicKey && localKeyPair?.publicKey !== user.publicKey) {
      throw new Error("Encrypted chat key backup original browser se create karo.");
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      senderId: user._id,
      receiverId: targetUserId,
      replyTo: payload.replyTo || null,
      text: payload.text || "",
      encryptedPayload: "",
      encrypted: false,
      encryptionVersion: 0,
      senderPublicKey: user.publicKey || localKeyPair?.publicKey || "",
      receiverPublicKey: targetUser?.publicKey || "",
      image: payload.image || "",
      video: payload.video || "",
      seen: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    updateConversationMessages(targetUserId, (prev) => [...prev, optimisticMessage]);

    try {
      const encryptedPayload = payload.text
        ? await encryptText({ text: payload.text, myUserId: user._id, peerPublicKey: targetUser?.publicKey })
        : "";
      const { data } = await api.post(`/messages/${targetUserId}`, { ...payload, text: "", encryptedPayload });
      const decryptedMessage = await decryptMessage(data.data, targetUser);
      updateConversationMessages(targetUserId, (prev) => {
        const confirmedMessage = { ...decryptedMessage, text: payload.text || decryptedMessage.text };
        const withoutTempOrDuplicate = prev.filter((m) => m._id !== tempId && m._id !== confirmedMessage._id);
        return [...withoutTempOrDuplicate, confirmedMessage].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      return decryptedMessage;
    } catch (error) {
      updateConversationMessages(targetUserId, (prev) => prev.filter((m) => m._id !== tempId));
      throw error;
    }
  }

  async function markSeen(messageId) {
    await api.patch(`/messages/${messageId}/seen`);
  }

  async function deleteMessage(messageId) {
    await api.delete(`/messages/${messageId}`);
    removeMessageFromCache(messageId);
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
      setSelectedUser: selectUser,
      loadUsers,
      loadMessages,
      messages,
      messagesLoading,
      sendMessage,
      markSeen,
      deleteMessage,
      socket,
      socketConnected,
      setUsers,
      typingUsers,
      emitTyping,
      stopTyping,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, selectedUser, messages, messagesLoading, socket, socketConnected, typingUsers]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => useContext(ChatContext);
