import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "https://quickchat-zlgq.onrender.com";

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) return;
    const s = io(SOCKET_URL, { transports: ["websocket"] });
    s.emit("user:online", user._id);
    s.on("presence:update", (onlineIds) => {
      setUsers((prev) => prev.map((u) => ({ ...u, isOnline: onlineIds.includes(u._id) })));
    });
    s.on("message:new", (message) => {
      if (selectedUser && message.senderId === selectedUser._id) setMessages((prev) => [...prev, message]);
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
    return () => s.disconnect();
  }, [user, selectedUser]);

  async function loadUsers() {
    const { data } = await api.get("/users");
    setUsers(data.data);
  }

  async function loadMessages(userId) {
    const { data } = await api.get(`/messages/${userId}`);
    setMessages(data.data);
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

export const useChat = () => useContext(ChatContext);
