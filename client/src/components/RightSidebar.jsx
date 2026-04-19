import { FiTrash2, FiX } from "react-icons/fi";
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
  return (
    <aside
      className={`rounded-3xl p-4 shadow-xl backdrop-blur ${
        mobile
          ? `fixed inset-x-3 bottom-3 z-40 max-h-[72vh] overflow-hidden ${
              isDark ? "border border-white/20 bg-[#11131a]/96" : "border border-slate-300 bg-white/95"
            }`
          : `hidden lg:block ${isDark ? "border border-white/20 bg-black/35" : "border border-slate-300 bg-white/70"}`
      }`}
    >
      {!selectedUser ? (
        <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Select a user to view profile details.</p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>Shared media</p>
            {mobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className={`rounded-full p-2 ${isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <FiX />
              </button>
            )}
          </div>
          <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="mx-auto h-20 w-20 rounded-full object-cover sm:h-28 sm:w-28" />
          <h3 className={`mt-3 text-center text-lg font-semibold sm:text-xl ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</h3>
          <p className={`mt-1 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{selectedUser.bio || "No bio available."}</p>

          <h4 className={`mt-6 mb-2 text-sm font-semibold uppercase tracking-wide ${isDark ? "text-slate-300" : "text-slate-600"}`}>Media</h4>
          <div className="chat-scroll grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {messages
              .filter((m) => m.image || m.video)
              .map((m) =>
                m.image ? (
                  <div key={m._id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onPreviewMedia?.({ type: "image", src: m.image })}
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
                      onClick={() => onPreviewMedia?.({ type: "video", src: m.video })}
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
            {!messages.some((m) => m.image || m.video) && (
              <p className={`col-span-2 rounded-2xl px-3 py-6 text-center text-sm ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                Is chat me abhi koi shared media nahi hai.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
