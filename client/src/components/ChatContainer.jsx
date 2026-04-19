import { useLayoutEffect, useRef } from "react";
import toast from "react-hot-toast";
import { FiGrid, FiImage, FiSend, FiTrash2, FiX } from "react-icons/fi";
import logoIcon from "../assets/logo_icon.svg";
import ProfileAvatar from "./ProfileAvatar";
import { processImageFile } from "../utils/image";

const MAX_VIDEO_SIZE_MB = 12;

export default function ChatContainer({
  user,
  selectedUser,
  messages,
  text,
  setText,
  setImage,
  setVideo,
  image = "",
  video = "",
  onSend,
  onDeleteMessage,
  onOpenMedia,
  onPreviewMedia,
  theme = "dark",
}) {
  const imageInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isDark = theme === "dark";

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, selectedUser]);

  function formatMessageTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (!selectedUser) {
    return (
      <main className={`grid h-full min-h-0 place-items-center overflow-hidden rounded-2xl p-5 ${isDark ? "border border-white/10 bg-black/10" : "border border-slate-300 bg-white/70"}`}>
        <div className="text-center">
          <img src={logoIcon} alt="QuickChat" className="mx-auto mb-3 h-12 w-12 opacity-90" />
          <p className={`text-xl font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>Chat anytime, anywhere</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`grid h-full min-h-0 grid-rows-[58px,minmax(0,1fr),auto] overflow-hidden rounded-2xl p-1.5 backdrop-blur-sm sm:grid-rows-[64px,minmax(0,1fr),auto] sm:p-3 ${isDark ? "border border-white/10 bg-black/15" : "border border-slate-300 bg-white/70"}`}>
      <header className={`flex h-[58px] items-center justify-between rounded-xl px-3 sm:h-[64px] ${isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white/80"}`}>
        <div className="flex items-center gap-3">
          <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9" />
          <div>
            <p className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</p>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{selectedUser.isOnline ? "Online" : "Offline"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenMedia}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg xl:hidden ${isDark ? "border border-white/10 bg-white/5 text-slate-300" : "border border-slate-200 bg-white text-slate-700"}`}
          title="Open media"
        >
          <FiGrid />
        </button>
      </header>

      <div
        ref={messagesContainerRef}
        className={`chat-scroll min-h-0 overflow-y-auto rounded-xl ${isDark ? "bg-black/20" : "bg-white/60"}`}
      >
        <div className="space-y-2 p-1.5 sm:p-3">
        {messages.map((m) => {
          const isMine = m.senderId === user._id;
          const avatarSrc = isMine ? user?.profilePic || "https://placehold.co/28x28?text=U" : selectedUser?.profilePic || "https://placehold.co/28x28?text=U";
          return (
            <div key={m._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] sm:max-w-[82%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`rounded-2xl px-3 py-2 ${isMine ? "bg-violet-600 text-white" : isDark ? "bg-white/10 text-slate-100" : "bg-slate-100 text-slate-800"}`}>
                  {!!m.text && <p className="text-sm">{m.text}</p>}
                  {!!m.image && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onPreviewMedia?.({ id: m._id, type: "image", src: m.image })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPreviewMedia?.({ id: m._id, type: "image", src: m.image });
                        }
                      }}
                      className="mt-2 block cursor-zoom-in"
                    >
                      <img src={m.image} className="max-h-64 rounded-xl" />
                    </div>
                  )}
                  {!!m.video && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onPreviewMedia?.({ id: m._id, type: "video", src: m.video })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPreviewMedia?.({ id: m._id, type: "video", src: m.video });
                        }
                      }}
                      className="mt-2 block cursor-zoom-in"
                    >
                      <video className="max-h-64 rounded-xl" muted playsInline>
                        <source src={m.video} />
                      </video>
                    </div>
                  )}
                  {isMine && !m.pending && (
                    <button
                      type="button"
                      title="Delete message"
                      onClick={() => onDeleteMessage?.(m._id)}
                      className="mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/90 hover:bg-black/10"
                    >
                      <FiTrash2 />
                      Delete
                    </button>
                  )}
                </div>
                <div className={`mt-1 flex items-center gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                  <ProfileAvatar src={avatarSrc} name={isMine ? user?.fullName : selectedUser?.fullName} className="h-5 w-5 rounded-full object-cover opacity-90" />
                  <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{formatMessageTime(m.createdAt)}</p>
                  {m.pending && <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-600"}`}>Uploading...</p>}
                  {isMine && <p className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>{m.seen ? "Seen" : "Sent"}</p>}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <form onSubmit={onSend} className={`mt-1.5 rounded-xl p-1.5 sm:mt-2 sm:p-2 ${isDark ? "border border-white/10 bg-black/40" : "border border-slate-300 bg-white/90"}`}>
        {(image || video) && (
          <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs ${isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
            <span>{video ? "Video attached" : "Image attached"}</span>
            <button
              type="button"
              onClick={() => {
                setImage("");
                setVideo("");
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-black/10"
            >
              <FiX />
              Remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm transition sm:h-10 sm:w-10 sm:rounded-xl sm:text-base ${isDark ? "border border-white/20 text-slate-300 hover:bg-white/10" : "border border-slate-300 text-slate-700 hover:bg-slate-100"}`}
            title="Attach image"
          >
            <FiImage />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.type.startsWith("video/")) {
                  const maxVideoBytes = MAX_VIDEO_SIZE_MB * 1024 * 1024;
                  if (file.size > maxVideoBytes) {
                    toast.error(`Video ${MAX_VIDEO_SIZE_MB}MB se chhota rakho for faster upload`);
                    e.target.value = "";
                    return;
                  }

                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setVideo(reader.result);
                    setImage("");
                  };
                  reader.onerror = () => toast.error("Video read nahi ho pa raha");
                  reader.readAsDataURL(file);
                  return;
                }

                const compressedImage = await processImageFile(file, {
                  maxWidth: 1280,
                  maxHeight: 1280,
                  quality: 0.72,
                });
                setImage(compressedImage);
                setVideo("");
              } catch (_error) {
                toast.error("Media process nahi ho pa raha");
              } finally {
                e.target.value = "";
              }
            }}
          />
          <input
            className={`h-9 flex-1 rounded-lg px-3 text-sm outline-none transition focus:border-violet-400 sm:h-10 sm:rounded-xl ${
              isDark
                ? "border border-white/20 bg-transparent text-slate-100 placeholder:text-slate-400"
                : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
            }`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
          />
          <button className="inline-flex h-9 min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 text-sm font-medium text-white transition hover:opacity-95 sm:h-10 sm:min-w-[88px] sm:gap-2 sm:rounded-xl sm:px-4">
            <FiSend />
            Send
          </button>
        </div>
      </form>
    </main>
  );
}
