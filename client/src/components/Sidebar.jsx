import { useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiLogOut, FiMoon, FiMoreVertical, FiSearch, FiSun, FiX } from "react-icons/fi";
import logoIcon from "../assets/logo_icon.svg";
import ProfileAvatar from "./ProfileAvatar";

export default function Sidebar({
  users,
  search,
  setSearch,
  selectedUser,
  setSelectedUser,
  onLogout,
  theme,
  toggleTheme,
  isMobileOpen = false,
  onCloseMobile,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isDark = theme === "dark";

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <aside
      className={`h-full rounded-2xl p-3 shadow-2xl backdrop-blur-md ${
        isDark ? "border border-white/20 bg-black/35" : "border border-slate-200/80 bg-white/75"
      } ${
        isMobileOpen ? "fixed inset-y-3 left-3 z-30 w-[88%] max-w-sm" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="QuickChat" className="h-5 w-5" />
          <h1 className={`text-lg font-medium ${isDark ? "text-white" : "text-slate-900"}`}>QuickChat</h1>
        </div>
        <div className="relative flex items-center gap-1 text-sm">
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className={`rounded-full p-2 transition md:hidden ${isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-slate-200/70"}`}
            >
              <FiX />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className={`rounded-full p-2 transition ${isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-slate-200/70"}`}
          >
            <FiMoreVertical />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-full p-2 transition ${isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-slate-200/70"}`}
            title="Toggle theme"
          >
            {theme === "dark" ? <FiSun /> : <FiMoon />}
          </button>

          {showMenu && (
            <div className={`absolute right-0 top-11 z-40 w-36 rounded-xl p-1 shadow-2xl ${isDark ? "border border-white/20 bg-[#171726]" : "border border-slate-200 bg-white"}`}>
              <Link
                to="/profile"
                onClick={() => setShowMenu(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isDark ? "text-slate-200 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <FiEdit2 />
                Edit Profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onLogout();
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isDark ? "text-rose-200 hover:bg-rose-500/20" : "text-rose-600 hover:bg-rose-50"}`}
              >
                <FiLogOut />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <FiSearch className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-400/80" : "text-slate-500"}`} />
        <input
          className={`w-full rounded-full py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 ${
            isDark
              ? "border border-white/10 bg-[#2a2553]/75 text-slate-200 placeholder:text-slate-400"
              : "border border-slate-300 bg-white/90 text-slate-800 placeholder:text-slate-500"
          }`}
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chat-scroll max-h-[70vh] space-y-1 overflow-y-auto pr-1">
        {filtered.map((u) => {
          const active = selectedUser?._id === u._id;
          return (
            <button
              key={u._id}
              onClick={() => setSelectedUser(u)}
              className={`w-full rounded-xl border px-2 py-2 text-left transition ${
                active
                  ? isDark
                    ? "border-violet-400/40 bg-violet-500/20"
                    : "border-violet-300 bg-violet-100"
                  : isDark
                    ? "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    : "border-transparent bg-transparent hover:border-slate-300 hover:bg-slate-100/70"
              }`}
            >
              <div className="flex items-center gap-3">
                <ProfileAvatar src={u.profilePic} name={u.fullName} className="h-11 w-11 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{u.fullName}</p>
                  <p
                    className={`truncate text-[11px] ${
                      u.isOnline ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {u.isOnline ? "Online" : "Offline"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${u.isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]" : "bg-slate-300"}`} />
                  {!!u.unreadCount && (
                    <span className="min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                      {u.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
