import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiChevronLeft, FiChevronRight, FiDownload, FiMenu, FiMinus, FiPlus, FiRotateCcw, FiShare2, FiX } from "react-icons/fi";
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
  const [previewMedia, setPreviewMedia] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewVideoRatio, setPreviewVideoRatio] = useState(null);
  const pinchStateRef = useRef(null);

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

  useEffect(() => {
    setPreviewZoom(1);
    setPreviewVideoRatio(null);
    pinchStateRef.current = null;
  }, [previewMedia]);

  const filteredUsers = useMemo(() => users, [users]);
  const previewableMedia = useMemo(
    () =>
      messages
        .filter((m) => m.image || m.video)
        .map((m) => ({
          id: m._id,
          type: m.image ? "image" : "video",
          src: m.image || m.video,
        })),
    [messages]
  );

  function clampZoom(value) {
    return Math.min(4, Math.max(1, Number(value.toFixed(2))));
  }

  function getTouchDistance(touches) {
    const [first, second] = touches;
    if (!first || !second) return 0;
    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.hypot(dx, dy);
  }

  async function handleDownloadPreview() {
    if (!previewMedia?.src) return;
    try {
      const response = await fetch(previewMedia.src);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const extension = previewMedia.type === "image" ? "jpg" : "mp4";
      link.href = blobUrl;
      link.download = `quickchat-media.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (_error) {
      window.open(previewMedia.src, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSharePreview() {
    if (!previewMedia?.src) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "QuickChat Media",
          url: previewMedia.src,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(previewMedia.src);
        toast.success("Media link copied");
        return;
      }
    } catch (_error) {
      // Fall through to final fallback.
    }

    window.open(previewMedia.src, "_blank", "noopener,noreferrer");
  }

  function openPreview(media) {
    const matchedMedia =
      previewableMedia.find((item) => (media.id ? item.id === media.id : item.src === media.src && item.type === media.type)) || media;
    setPreviewMedia(matchedMedia);
    setPreviewZoom(1);
  }

  function stepPreview(direction) {
    if (!previewMedia || previewableMedia.length <= 1) return;
    const currentIndex = previewableMedia.findIndex((item) => item.id === previewMedia.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + previewableMedia.length) % previewableMedia.length;
    setPreviewMedia(previewableMedia[nextIndex]);
  }

  const isPortraitPreviewVideo = previewMedia?.type === "video" && previewVideoRatio && previewVideoRatio < 1;

  useEffect(() => {
    if (!previewMedia) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPreviewMedia(null);
      }
      if (event.key === "ArrowLeft") {
        stepPreview(-1);
      }
      if (event.key === "ArrowRight") {
        stepPreview(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMedia, previewableMedia]);

  return (
    <div className={`min-h-screen p-0 md:grid md:place-items-center md:p-3 ${theme === "dark" ? "bg-black" : "bg-slate-100"}`}>
      <div
        className={`relative h-screen w-full max-w-6xl overflow-hidden p-2 md:h-[calc(100vh-24px)] md:rounded-2xl md:border md:p-2 lg:h-[92vh] lg:p-4 ${
          theme === "dark" ? "bg-[#15151c] md:border-white/25" : "bg-white md:border-slate-300"
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
      <div className="mb-2 flex items-center justify-between px-2 pt-2 lg:hidden">
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

      {previewMedia && (
        <button
          aria-label="Close media preview"
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 bg-black/85"
        />
      )}

      <div className="grid h-[calc(100%-48px)] min-h-0 grid-cols-1 gap-2 px-2 pb-2 lg:h-full lg:grid-cols-12 lg:gap-3 lg:px-0 lg:pb-0">
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

      <div className="min-h-0 h-full lg:col-span-8 xl:col-span-6">
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
          onPreviewMedia={openPreview}
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
            onPreviewMedia={openPreview}
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
          onPreviewMedia={openPreview}
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

      {previewMedia ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {previewableMedia.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => stepPreview(-1)}
                className="absolute left-4 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                aria-label="Previous media"
              >
                <FiChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => stepPreview(1)}
                className="absolute right-4 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                aria-label="Next media"
              >
                <FiChevronRight />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setPreviewMedia(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            aria-label="Close preview"
          >
            <FiX />
          </button>
          {previewMedia.type === "image" ? (
            <>
              <div className="absolute bottom-4 left-1/2 z-[61] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-white backdrop-blur">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => clampZoom(prev - 0.25))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Zoom out"
                >
                  <FiMinus />
                </button>
                <span className="min-w-12 text-center text-sm font-medium">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => clampZoom(prev + 0.25))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Zoom in"
                >
                  <FiPlus />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Reset zoom"
                >
                  <FiRotateCcw />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Download media"
                >
                  <FiDownload />
                </button>
                <button
                  type="button"
                  onClick={handleSharePreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Share media"
                >
                  <FiShare2 />
                </button>
                {previewableMedia.length > 1 && (
                  <span className="min-w-14 text-center text-sm font-medium">
                    {previewableMedia.findIndex((item) => item.id === previewMedia.id) + 1}/{previewableMedia.length}
                  </span>
                )}
              </div>
              <div
                className="relative flex max-h-full max-w-full items-center justify-center overflow-auto rounded-2xl"
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.2 : -0.2;
                  setPreviewZoom((prev) => clampZoom(prev + delta));
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 2) return;
                  pinchStateRef.current = {
                    distance: getTouchDistance(e.touches),
                    zoom: previewZoom,
                  };
                }}
                onTouchMove={(e) => {
                  if (e.touches.length !== 2 || !pinchStateRef.current) return;
                  const nextDistance = getTouchDistance(e.touches);
                  const baseDistance = pinchStateRef.current.distance || nextDistance;
                  const scaleRatio = nextDistance / baseDistance;
                  setPreviewZoom(clampZoom(pinchStateRef.current.zoom * scaleRatio));
                }}
                onTouchEnd={() => {
                  pinchStateRef.current = null;
                }}
              >
                {previewableMedia.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => stepPreview(-1)}
                      className="absolute left-0 top-0 z-[62] h-full w-1/5 cursor-w-resize bg-transparent"
                      aria-label="Previous media area"
                    />
                    <button
                      type="button"
                      onClick={() => stepPreview(1)}
                      className="absolute right-0 top-0 z-[62] h-full w-1/5 cursor-e-resize bg-transparent"
                      aria-label="Next media area"
                    />
                  </>
                )}
                <img
                  src={previewMedia.src}
                  alt="Shared media preview"
                  className={`max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-transform duration-150 ${
                    previewZoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewZoom((prev) => (prev > 1 ? 1 : 2));
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setPreviewZoom((prev) => clampZoom(prev >= 2 ? prev + 0.5 : 2));
                  }}
                  style={{ transform: `scale(${previewZoom})`, transformOrigin: "center center" }}
                />
              </div>
            </>
          ) : (
            <div className="relative flex max-h-[88vh] max-w-[min(92vw,1100px)] flex-col items-center justify-center gap-4">
              <div className="z-[61] flex flex-wrap items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-white backdrop-blur">
                <button
                  type="button"
                  onClick={handleDownloadPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Download media"
                >
                  <FiDownload />
                </button>
                <button
                  type="button"
                  onClick={handleSharePreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Share media"
                >
                  <FiShare2 />
                </button>
                {previewableMedia.length > 1 && (
                  <span className="min-w-14 text-center text-sm font-medium">
                    {previewableMedia.findIndex((item) => item.id === previewMedia.id) + 1}/{previewableMedia.length}
                  </span>
                )}
              </div>
              <div
                className={`flex max-h-[78vh] max-w-full items-center justify-center overflow-hidden bg-black/80 shadow-2xl backdrop-blur-sm ${
                  isPortraitPreviewVideo
                    ? "rounded-[32px] border border-white/10 px-3 py-4 sm:px-4 sm:py-5"
                    : "rounded-[28px] p-2 sm:p-3"
                }`}
              >
                <video
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={(event) => {
                    const { videoWidth, videoHeight } = event.currentTarget;
                    if (!videoWidth || !videoHeight) return;
                    setPreviewVideoRatio(videoWidth / videoHeight);
                  }}
                  className={`block bg-black object-contain ${
                    isPortraitPreviewVideo
                      ? "max-h-[70vh] w-auto max-w-[82vw] rounded-[26px] sm:max-w-[min(52vw,420px)] lg:max-w-[min(36vw,360px)]"
                      : "max-h-[72vh] max-w-[min(88vw,920px)] rounded-[22px]"
                  }`}
                >
                  <source src={previewMedia.src} />
                </video>
              </div>
            </div>
          )}
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}
