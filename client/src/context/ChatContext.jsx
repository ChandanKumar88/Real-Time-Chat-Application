import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const USERS_POLL_INTERVAL_MS = 8000;
const MESSAGES_POLL_INTERVAL_MS = 3000;
const PRESENCE_PING_INTERVAL_MS = 20000;

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const selectedUserRef = useRef(null);
  const onlineUserIdsRef = useRef(new Set());

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

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
    });
    s.on("message:new", (message) => {
      if (selectedUserRef.current && message.senderId === selectedUserRef.current._id) {
        setMessages((prev) => [...prev, message]);
        setUsers((prev) => prev.map((u) => (u._id === message.senderId ? { ...u, unreadCount: 0 } : u)));
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u._id === message.senderId ? { ...u, unreadCount: (u.unreadCount || 0) + 1 } : u))
      );
    });
    s.on("message:seen", (seenMessage) => {
      setMessages((prev) => prev.map((m) => (m._id === seenMessage._id ? seenMessage : m)));
    });
    s.on("message:deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });
    setSocket(s);
    const pingInterval = window.setInterval(() => {
      if (s.connected) s.emit("presence:ping", user._id);
      api.patch("/users/presence/online").catch(() => null);
    }, PRESENCE_PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", announceOnline);

    return () => {
      window.clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", announceOnline);
      s.io.off("reconnect", announceOnline);
      s.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      // eslint-disable-next-line react-hooks/immutability
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
        setMessages((prev) => {
          const nextMessages = data.data || [];
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
    setMessages(data.data);
    setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, unreadCount: 0 } : u)));
    return data.data;
  }

  async function sendMessage(targetUserId, payload) {
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      senderId: user._id,
      receiverId: targetUserId,
      text: payload.text || "",
      image: payload.image || "",
      video: payload.video || "",
      seen: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data } = await api.post(`/messages/${targetUserId}`, payload);
      setMessages((prev) => prev.map((m) => (m._id === tempId ? data.data : m)));
      return data.data;
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

  const value = useMemo(
    () => ({ users, selectedUser, setSelectedUser, loadUsers, loadMessages, messages, sendMessage, markSeen, deleteMessage, socket, setUsers }),
    [users, selectedUser, messages, socket]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => useContext(ChatContext);
