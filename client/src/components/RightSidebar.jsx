import { useMemo, useState } from "react";
import { FiFile, FiImage, FiLink, FiTrash2, FiUser, FiX } from "react-icons/fi";
import ProfileAvatar from "./ProfileAvatar";

export default function RightSidebar({
  selectedUser,
  messages,
  currentUserId,
  onDeleteMessage,
  onPreviewMedia,
  theme = "dark",
  mobile = false,
  onCloseMobile,
}) {
  const isDark = theme === "dark";
  const [activeSection, setActiveSection] = useState("contact");
  const sharedMedia = messages.filter((m) => m.image || m.video);
  const sharedLinks = useMemo(() => {
    const linkPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    return messages.flatMap((message) => {
      const matches = message.text?.match(linkPattern) || [];
      return matches.map((url) => ({
        id: `${message._id}-${url}`,
        url,
        senderId: message.senderId,
        createdAt: message.createdAt,
      }));
    });
  }, [messages]);
  const sharedFiles = messages.filter((message) => message.file || message.document || message.audio);

  const sections = [
    { id: "contact", label: "Info", icon: FiUser },
    { id: "media", label: "Media", icon: FiImage },
    { id: "links", label: "Links", icon: FiLink },
    { id: "files", label: "Files", icon: FiFile },
  ];

  function formatPanelTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getPanelTitle() {
    if (activeSection === "contact") return "Contact info";
    if (activeSection === "links") return "Links";
    if (activeSection === "files") return "Files";
    return "Shared media";
  }

  return (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-3xl p-4 shadow-xl backdrop-blur ${
        mobile
          ? `fixed inset-x-3 bottom-3 z-40 max-h-[72vh] overflow-hidden lg:hidden ${
              isDark ? "border border-white/20 bg-[#11131a]/96" : "border border-slate-300 bg-white/95"
            }`
          : `hidden lg:flex ${isDark ? "border border-white/20 bg-black/35" : "border border-slate-300 bg-white/70"}`
      }`}
    >
      {!selectedUser ? (
        <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Select a user to view profile details.</p>
      ) : (
        <>
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <p className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{getPanelTitle()}</p>
            {(mobile || onCloseMobile) && (
              <button
                type="button"
                onClick={onCloseMobile}
                className={`rounded-full p-2 ${isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <FiX />
              </button>
            )}
          </div>

          <div className={`mb-4 grid shrink-0 grid-cols-4 rounded-2xl p-1 ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
                    active
                      ? isDark
                        ? "bg-violet-500/25 text-violet-100"
                        : "bg-white text-violet-700 shadow-sm"
                      : isDark
                        ? "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  }`}
                >
                  <Icon className="text-sm" />
                  {section.label}
                </button>
              );
            })}
          </div>

          {activeSection === "contact" && (
            <div className="chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
              <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="mx-auto h-20 w-20 rounded-full object-cover sm:h-28 sm:w-28" />
              <h3 className={`mt-3 text-center text-lg font-semibold sm:text-xl ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</h3>
              <p
                className={`mt-1 flex items-center justify-center gap-1.5 text-xs ${
                  selectedUser.isOnline ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${selectedUser.isOnline ? "bg-emerald-500" : "bg-slate-400"}`} />
                {selectedUser.isOnline ? "Online" : "Offline"}
              </p>
              <div className={`mt-5 rounded-2xl px-3 py-4 text-sm ${isDark ? "bg-white/5 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-slate-500" : "text-slate-500"}`}>About</p>
                <p>{selectedUser.bio || "No bio available."}</p>
              </div>
            </div>
          )}

          {activeSection === "media" && (
            <div className="chat-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-x-hidden overflow-y-auto pr-1">
              {sharedMedia.map((m) =>
                m.image ? (
                  <div key={m._id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onPreviewMedia?.({ id: m._id, type: "image", src: m.image })}
                      className="block w-full"
                    >
                      <img src={m.image} className="h-24 w-full rounded-xl object-cover" />
                    </button>
                    {m.senderId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage?.(m._id)}
                        className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-white group-hover:block"
                        title="Delete media"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={m._id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onPreviewMedia?.({ id: m._id, type: "video", src: m.video })}
                      className="block w-full"
                    >
                      <video className="h-24 w-full rounded-xl object-cover">
                        <source src={m.video} />
                      </video>
                    </button>
                    {m.senderId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage?.(m._id)}
                        className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-white group-hover:block"
                        title="Delete media"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    )}
                  </div>
                )
              )}
              {!sharedMedia.length && (
                <p className={`col-span-2 rounded-2xl px-3 py-6 text-center text-sm ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  Is chat me abhi koi shared media nahi hai.
                </p>
              )}
            </div>
          )}

          {activeSection === "links" && (
            <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
              {sharedLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`block rounded-2xl border px-3 py-3 text-sm transition ${
                    isDark ? "border-white/10 bg-white/5 text-sky-200 hover:bg-white/10" : "border-slate-200 bg-white/80 text-sky-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="line-clamp-2 break-all">{link.url}</span>
                  <span className={`mt-1 block text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                    {link.senderId === currentUserId ? "You" : selectedUser.fullName} - {formatPanelTime(link.createdAt)}
                  </span>
                </a>
              ))}
              {!sharedLinks.length && (
                <p className={`rounded-2xl px-3 py-6 text-center text-sm ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  Is chat me abhi koi shared link nahi hai.
                </p>
              )}
            </div>
          )}

          {activeSection === "files" && (
            <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
              {sharedFiles.map((fileMessage) => (
                <div
                  key={fileMessage._id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm ${isDark ? "bg-white/5 text-slate-300" : "bg-slate-100 text-slate-600"}`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isDark ? "bg-white/10" : "bg-white"}`}>
                    <FiFile />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{fileMessage.file?.name || fileMessage.document?.name || "Shared file"}</span>
                </div>
              ))}
              {!sharedFiles.length && (
                <p className={`rounded-2xl px-3 py-6 text-center text-sm ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  Is chat me abhi koi shared file nahi hai.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
