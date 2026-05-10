import { useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiChevronDown, FiCornerUpLeft, FiGrid, FiImage, FiLock, FiSend, FiTrash2, FiX } from "react-icons/fi";
import logoIcon from "../assets/logo_icon.svg";
import ProfileAvatar from "./ProfileAvatar";
import { processImageFile } from "../utils/image";

const IS_VERCEL_HOSTED = typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app");
const MAX_VIDEO_SIZE_MB = IS_VERCEL_HOSTED ? 4.5 : 12;

export default function ChatContainer({
  user,
  selectedUser,
  messages,
  text,
  setText,
  onTextChange,
  setImage,
  setVideo,
  image = "",
  video = "",
  replyToMessage = null,
  isTyping = false,
  onSend,
  onDeleteMessage,
  onReplyMessage,
  onCancelReply,
  onOpenMedia,
  onPreviewMedia,
  theme = "dark",
}) {
  const imageInputRef = useRef(null);
  const textInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [mediaError, setMediaError] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [swipeState, setSwipeState] = useState(null);
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

  function getMessageId(value) {
    return value?._id || value || "";
  }

  function getMessagePreview(message) {
    if (!message) return "Original message";
    if (message.decryptionFailed) return "Message can't be opened on this device";
    if (message.text) return message.text;
    if (message.image) return "Photo";
    if (message.video) return "Video";
    return "Message";
  }

  function getMessageAuthor(message) {
    if (!message) return "Message";
    return message.senderId === user._id ? "You" : selectedUser?.fullName || "User";
  }

  function getReplyMessage(message) {
    const replyId = getMessageId(message?.replyTo);
    if (!replyId) return null;
    return messages.find((item) => item._id === replyId) || null;
  }

  function selectReply(message) {
    onReplyMessage?.(message);
    setOpenMenuId("");
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  }

  function handleTouchStart(event, message) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    setSwipeState({ id: message._id, startX: touch.clientX, startY: touch.clientY, offset: 0 });
  }

  function handleTouchMove(event, message) {
    if (!swipeState || swipeState.id !== message._id || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipeState.startX;
    const dy = Math.abs(touch.clientY - swipeState.startY);
    if (dy > 42 && Math.abs(dx) < 24) {
      setSwipeState(null);
      return;
    }

    const nextOffset = Math.max(0, Math.min(76, dx));
    if (nextOffset > 4) event.preventDefault();
    setSwipeState((prev) => (prev ? { ...prev, offset: nextOffset } : prev));
  }

  function handleTouchEnd(message) {
    if (swipeState?.id === message._id && swipeState.offset >= 54) {
      selectReply(message);
    }
    setSwipeState(null);
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
    <main className={`grid h-full min-h-0 grid-rows-[54px,minmax(0,1fr),auto] overflow-hidden rounded-2xl p-1 backdrop-blur-sm sm:grid-rows-[64px,minmax(0,1fr),auto] sm:p-3 ${isDark ? "border border-white/10 bg-black/15" : "border border-slate-300 bg-white/70"}`}>
      <header className={`flex h-[54px] items-center justify-between rounded-xl px-2.5 sm:h-[64px] sm:px-3 ${isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white/80"}`}>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="h-8 w-8 shrink-0 rounded-full object-cover sm:h-9 sm:w-9" />
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</p>
            <p
              className={`inline-flex items-center gap-1.5 text-xs ${
                isTyping ? "text-violet-300" : selectedUser.isOnline ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isTyping ? "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.9)]" : selectedUser.isOnline ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {isTyping ? "Typing..." : selectedUser.isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenMedia}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg xl:hidden sm:h-9 sm:w-9 ${isDark ? "border border-white/10 bg-white/5 text-slate-300" : "border border-slate-200 bg-white text-slate-700"}`}
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
          const repliedMessage = getReplyMessage(m);
          const swipeOffset = swipeState?.id === m._id ? swipeState.offset : 0;
          return (
            <div
              key={m._id}
              className={`relative flex ${isMine ? "justify-end" : "justify-start"}`}
              onTouchStart={(event) => handleTouchStart(event, m)}
              onTouchMove={(event) => handleTouchMove(event, m)}
              onTouchEnd={() => handleTouchEnd(m)}
              onTouchCancel={() => setSwipeState(null)}
            >
              {swipeOffset > 10 && (
                <div className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 ${isDark ? "bg-white/10 text-violet-200" : "bg-violet-100 text-violet-700"}`}>
                  <FiCornerUpLeft />
                </div>
              )}
              <div
                className={`flex max-w-[92%] flex-col transition-transform sm:max-w-[82%] ${isMine ? "items-end" : "items-start"}`}
                style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined }}
              >
                <div className={`group relative max-w-full rounded-2xl px-2.5 py-2 sm:px-3 ${isMine ? "bg-violet-600 text-white" : isDark ? "bg-white/10 text-slate-100" : "bg-slate-100 text-slate-800"}`}>
                  <button
                    type="button"
                    title="Message options"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((id) => (id === m._id ? "" : m._id));
                    }}
                    className={`absolute top-1 hidden h-7 w-7 items-center justify-center rounded-full text-sm opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 sm:inline-flex ${
                      isMine ? "right-1 bg-black/10 text-white hover:bg-black/20" : "right-1 bg-black/10 text-slate-200 hover:bg-black/20"
                    }`}
                    aria-label="Message options"
                  >
                    <FiChevronDown />
                  </button>
                  {openMenuId === m._id && (
                    <div
                      className={`absolute top-0 z-30 min-w-[148px] overflow-hidden rounded-xl border py-1.5 text-sm shadow-2xl backdrop-blur-md ${
                        isMine ? "right-[calc(100%+8px)]" : "left-[calc(100%+8px)]"
                      } ${
                        isDark ? "border-white/10 bg-[#15151c] text-slate-100" : "border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectReply(m)}
                        className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                      >
                        <FiCornerUpLeft className="h-4 w-4 shrink-0" />
                        Reply
                      </button>
                      {isMine && !m.pending && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId("");
                            onDeleteMessage?.(m._id);
                          }}
                          className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                        >
                          <FiTrash2 className="h-4 w-4 shrink-0" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {!!getMessageId(m.replyTo) && (
                    <div className={`mb-2 max-w-[min(70vw,320px)] rounded-xl border-l-2 px-2.5 py-2 text-xs ${isMine ? "border-white/70 bg-black/15 text-white/90" : isDark ? "border-violet-300 bg-black/25 text-slate-200" : "border-violet-500 bg-white/80 text-slate-700"}`}>
                      <p className={`truncate font-semibold ${isMine ? "text-white" : "text-violet-300"}`}>{getMessageAuthor(repliedMessage)}</p>
                      <p className="line-clamp-2 break-words opacity-85">{getMessagePreview(repliedMessage)}</p>
                    </div>
                  )}
                  {m.decryptionFailed && (
                    <div
                      className={`flex max-w-[min(70vw,360px)] items-center gap-2 rounded-xl px-2.5 py-2 text-xs sm:text-sm ${
                        isMine
                          ? "bg-black/15 text-white/90"
                          : isDark
                            ? "bg-black/25 text-slate-200"
                            : "bg-white/80 text-slate-700"
                      }`}
                    >
                      <FiLock className="h-4 w-4 shrink-0" />
                      <span className="break-words">Message can't be opened on this device.</span>
                    </div>
                  )}
                  {!!m.text && <p className="break-words text-sm">{m.text}</p>}
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
                      className="mt-2 block max-w-full cursor-zoom-in"
                    >
                      <img src={m.image} className="block max-h-56 w-full max-w-[min(58vw,240px)] rounded-xl object-cover sm:max-h-64 sm:max-w-full" />
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
                      className="mt-2 block max-w-full cursor-zoom-in"
                    >
                      <video className="block max-h-56 w-full max-w-[min(58vw,240px)] rounded-xl object-cover sm:max-h-64 sm:max-w-full" muted playsInline>
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

      <form onSubmit={onSend} className={`mt-1 rounded-xl p-1.5 sm:mt-2 sm:p-2 ${isDark ? "border border-white/10 bg-black/40" : "border border-slate-300 bg-white/90"}`}>
        {replyToMessage && (
          <div className={`mb-2 flex items-center gap-2 rounded-xl border-l-2 px-2.5 py-2 text-xs ${isDark ? "border-violet-300 bg-white/10 text-slate-200" : "border-violet-500 bg-slate-100 text-slate-700"}`}>
            <FiCornerUpLeft className="h-4 w-4 shrink-0 text-violet-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{getMessageAuthor(replyToMessage)}</p>
              <p className="truncate opacity-80">{getMessagePreview(replyToMessage)}</p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isDark ? "hover:bg-white/10" : "hover:bg-white"}`}
              title="Cancel reply"
              aria-label="Cancel reply"
            >
              <FiX />
            </button>
          </div>
        )}
        {(image || video) && (
          <div className={`mb-2 flex items-center gap-2 rounded-xl px-2 py-2 text-xs ${isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
            <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              {image ? (
                <img src={image} alt="Selected media" className="h-full w-full object-cover" />
              ) : (
                <video className="h-full w-full object-cover" muted playsInline>
                  <source src={video} />
                </video>
              )}
              <button
                type="button"
                onClick={() => {
                  setMediaError("");
                  setImage("");
                  setVideo("");
                }}
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white"
                aria-label="Remove selected media"
                title="Remove selected media"
              >
                <FiX />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{video ? "Video attached" : "Image attached"}</p>
              <p className={`${isDark ? "text-slate-400" : "text-slate-500"}`}>Send karne se pehle yahan se hata sakte ho</p>
            </div>
          </div>
        )}
        {!!mediaError && (
          <p className={`mb-2 px-1 text-xs ${isDark ? "text-rose-300" : "text-rose-600"}`}>
            {mediaError}
          </p>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm transition sm:h-10 sm:w-10 sm:rounded-xl sm:text-base ${isDark ? "border border-white/20 text-slate-300 hover:bg-white/10" : "border border-slate-300 text-slate-700 hover:bg-slate-100"}`}
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
              setMediaError("");
              try {
                if (file.type.startsWith("video/")) {
                  const maxVideoBytes = MAX_VIDEO_SIZE_MB * 1024 * 1024;
                  if (file.size > maxVideoBytes) {
                    const message = IS_VERCEL_HOSTED
                      ? `Vercel deploy par video ${MAX_VIDEO_SIZE_MB}MB ya usse chhota rakho, warna upload fail ho sakta hai`
                      : `Video ${MAX_VIDEO_SIZE_MB}MB se chhota rakho for faster upload`;
                    setMediaError(message);
                    toast.error(message);
                    setImage("");
                    setVideo("");
                    e.target.value = "";
                    return;
                  }

                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setMediaError("");
                    setVideo(reader.result);
                    setImage("");
                  };
                  reader.onerror = () => {
                    setMediaError("Video read nahi ho pa raha");
                    toast.error("Video read nahi ho pa raha");
                  };
                  reader.readAsDataURL(file);
                  return;
                }

                const compressedImage = await processImageFile(file, {
                  maxWidth: 1280,
                  maxHeight: 1280,
                  quality: 0.72,
                });
                setMediaError("");
                setImage(compressedImage);
                setVideo("");
              } catch {
                setMediaError("Media process nahi ho pa raha");
                toast.error("Media process nahi ho pa raha");
              } finally {
                e.target.value = "";
              }
            }}
          />
          <input
            ref={textInputRef}
            className={`h-8 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none transition focus:border-violet-400 sm:h-10 sm:rounded-xl ${
              isDark
                ? "border border-white/20 bg-transparent text-slate-100 placeholder:text-slate-400"
                : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
            }`}
            value={text}
            onChange={(e) => (onTextChange ? onTextChange(e.target.value) : setText(e.target.value))}
            placeholder="Type a message..."
          />
          <button className="inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-medium text-white transition hover:opacity-95 sm:h-10 sm:min-w-[88px] sm:gap-2 sm:rounded-xl sm:px-4">
            <FiSend />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </form>
    </main>
  );
}
