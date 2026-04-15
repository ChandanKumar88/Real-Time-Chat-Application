import { FiTrash2 } from "react-icons/fi";
import ProfileAvatar from "./ProfileAvatar";

export default function RightSidebar({ selectedUser, messages, currentUserId, onDeleteMessage, theme = "dark" }) {
  const isDark = theme === "dark";
  return (
    <aside className={`hidden rounded-3xl p-4 shadow-xl backdrop-blur lg:block ${isDark ? "border border-white/20 bg-black/35" : "border border-slate-300 bg-white/70"}`}>
      {!selectedUser ? (
        <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Select a user to view profile details.</p>
      ) : (
        <>
          <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="mx-auto h-28 w-28 rounded-full object-cover" />
          <h3 className={`mt-3 text-center text-xl font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</h3>
          <p className={`mt-1 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{selectedUser.bio || "No bio available."}</p>

          <h4 className={`mt-6 mb-2 text-sm font-semibold uppercase tracking-wide ${isDark ? "text-slate-300" : "text-slate-600"}`}>Media</h4>
          <div className="chat-scroll grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {messages
              .filter((m) => m.image || m.video)
              .map((m) =>
                m.image ? (
                  <div key={m._id} className="group relative">
                    <img src={m.image} className="h-24 w-full rounded-xl object-cover" />
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
                    <video controls className="h-24 w-full rounded-xl object-cover">
                      <source src={m.video} />
                    </video>
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
          </div>
        </>
      )}
    </aside>
  );
}
