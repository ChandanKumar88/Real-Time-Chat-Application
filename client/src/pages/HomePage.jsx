import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiMenu } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import bgImage from "../assets/bgImage.svg";

export default function HomePage() {
  const { user, logout } = useAuth();
  const { users, loadUsers, selectedUser, setSelectedUser, loadMessages, messages, sendMessage, markSeen, deleteMessage } = useChat();
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [video, setVideo] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("chat_theme") || "light");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMediaOpen, setIsMediaOpen] = useState(false);

  useEffect(() => {
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("chat_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!selectedUser) return;
    loadMessages(selectedUser._id).catch((error) => {
      toast.error(error?.response?.data?.message || "Failed to load messages");
    });
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) return;
    messages.forEach((m) => {
      if (m.receiverId === user._id && !m.seen) markSeen(m._id).catch(() => null);
    });
  }, [messages, selectedUser, user?._id]);

  const filteredUsers = useMemo(() => users, [users]);

  return (
    <div className={`min-h-screen p-2 md:grid md:place-items-center md:p-3 ${theme === "dark" ? "bg-black" : "bg-slate-100"}`}>
      <div
        className={`relative w-full max-w-6xl overflow-hidden rounded-2xl p-2 lg:h-[92vh] lg:p-4 ${
          theme === "dark" ? "border border-white/25 bg-[#15151c]" : "border border-slate-300 bg-white"
        }`}
        style={{
          backgroundImage:
            theme === "dark"
              ? `linear-gradient(rgba(12,12,16,0.6), rgba(12,12,16,0.7)), url(${bgImage})`
              : `linear-gradient(rgba(255,255,255,0.72), rgba(255,255,255,0.72)), url(${bgImage})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
      <div className="mb-2 flex items-center justify-between lg:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm shadow ${
            theme === "dark" ? "border border-white/20 bg-white/10 text-slate-200" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          <FiMenu />
          Menu
        </button>
        <p className={`text-sm font-semibold ${theme === "dark" ? "text-slate-200" : "text-slate-700"}`}>Quick Chat</p>
      </div>

      {isSidebarOpen && (
        <button
          aria-label="Close sidebar backdrop"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
        />
      )}

      {isMediaOpen && (
        <button
          aria-label="Close media backdrop"
          onClick={() => setIsMediaOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/55 xl:hidden"
        />
      )}

      <div className="grid min-h-[calc(100vh-84px)] grid-cols-1 gap-2 lg:h-full lg:min-h-0 lg:grid-cols-12 lg:gap-3">
      <div className="hidden lg:col-span-4 lg:block lg:h-full xl:col-span-3">
        <Sidebar
          users={filteredUsers}
          search={search}
          setSearch={setSearch}
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          onLogout={logout}
          theme={theme}
          toggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        />
      </div>

      {isSidebarOpen && (
        <Sidebar
          users={filteredUsers}
          search={search}
          setSearch={setSearch}
          selectedUser={selectedUser}
          setSelectedUser={(u) => {
            setSelectedUser(u);
            setIsSidebarOpen(false);
          }}
          onLogout={logout}
          theme={theme}
          toggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          isMobileOpen
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="min-h-[76vh] lg:col-span-8 lg:h-full lg:min-h-0 xl:col-span-6">
        <ChatContainer
          user={user}
          selectedUser={selectedUser}
          messages={messages}
          text={text}
          setText={setText}
          setImage={setImage}
          setVideo={setVideo}
          image={image}
          video={video}
          theme={theme}
          onOpenMedia={() => setIsMediaOpen(true)}
          onDeleteMessage={async (messageId) => {
            const confirmed = window.confirm("Delete this message?");
            if (!confirmed) return;
            try {
              await deleteMessage(messageId);
            } catch (error) {
              toast.error(error?.response?.data?.message || "Failed to delete message");
            }
          }}
          onSend={async (e) => {
            e.preventDefault();
            if (!selectedUser || (!text.trim() && !image && !video)) return;
            const payload = { text: text.trim(), image, video };
            setText("");
            setImage("");
            setVideo("");
            try {
              await sendMessage(selectedUser._id, payload);
            } catch (error) {
              setText(payload.text);
              setImage(payload.image);
              setVideo(payload.video);
              toast.error(error?.response?.data?.message || "Failed to send media");
            }
          }}
        />
      </div>

      <div className="hidden xl:col-span-3 xl:block xl:h-full">
        {selectedUser ? (
          <RightSidebar
            selectedUser={selectedUser}
            messages={messages}
            currentUserId={user?._id}
            onDeleteMessage={async (messageId) => {
              const confirmed = window.confirm("Delete this media?");
              if (!confirmed) return;
              try {
                await deleteMessage(messageId);
              } catch (error) {
                toast.error(error?.response?.data?.message || "Failed to delete media");
              }
            }}
            theme={theme}
          />
        ) : null}
      </div>

      {isMediaOpen && selectedUser ? (
        <RightSidebar
          selectedUser={selectedUser}
          messages={messages}
          currentUserId={user?._id}
          onDeleteMessage={async (messageId) => {
            const confirmed = window.confirm("Delete this media?");
            if (!confirmed) return;
            try {
              await deleteMessage(messageId);
            } catch (error) {
              toast.error(error?.response?.data?.message || "Failed to delete media");
            }
          }}
          theme={theme}
          mobile
          onCloseMobile={() => setIsMediaOpen(false)}
        />
      ) : null}
      </div>
      </div>
    </div>
  );
}
