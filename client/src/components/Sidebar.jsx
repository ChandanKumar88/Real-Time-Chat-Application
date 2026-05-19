import { useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiLogOut, FiMessageCircle, FiMoon, FiMoreVertical, FiPhone, FiSearch, FiSun, FiVideo, FiX } from "react-icons/fi";
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
  callHistory = [],
  conversationPreviews = {},
  isMobileOpen = false,
  onCloseMobile,
  activeTab,
  onTabChange,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [localActiveTab, setLocalActiveTab] = useState("chats");
  const [callSearch, setCallSearch] = useState("");
  const isDark = theme === "dark";
  const currentTab = isMobileOpen ? "chats" : activeTab || localActiveTab;

  function formatPreviewTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function handleTabChange(nextTab) {
    if (onTabChange) {
      onTabChange(nextTab);
      return;
    }

    setLocalActiveTab(nextTab);
  }

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
  const filteredCalls = callHistory.filter((call) => {
    const q = callSearch.trim().toLowerCase();
    if (!q) return true;

    return [call.name, call.statusLabel, call.status, call.type, call.time]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  return (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-3 shadow-2xl backdrop-blur-md ${
        isDark ? "border border-white/20 bg-black/35" : "border border-slate-200/80 bg-white/75"
      } ${
        isMobileOpen ? "fixed inset-y-3 left-3 z-30 w-[88%] max-w-sm" : ""
      }`}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between px-1">
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

      <div className={`mb-4 hidden shrink-0 grid-cols-2 rounded-2xl p-1 lg:grid ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
        {[
          { id: "chats", label: "Chats", icon: FiMessageCircle },
          { id: "calls", label: "Calls", icon: FiPhone },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                active
                  ? isDark
                    ? "bg-violet-500/25 text-violet-100"
                    : "bg-white text-violet-700 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              <Icon className="text-base" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {currentTab === "chats" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative mb-4 shrink-0">
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

          <div className="chat-scroll min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto pr-1">
            {filtered.map((u) => {
              const active = selectedUser?._id === u._id;
              const preview = conversationPreviews[u._id];
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
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{u.fullName}</p>
                        {preview?.createdAt && (
                          <span className={`shrink-0 text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            {formatPreviewTime(preview.createdAt)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`truncate text-[11px] ${
                          preview ? (isDark ? "text-slate-400" : "text-slate-500") : u.isOnline ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {preview?.text || (u.isOnline ? "Online" : "Offline")}
                      </p>
                    </div>
                    <div className="flex min-w-[42px] flex-col items-end justify-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${u.isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]" : "bg-slate-300"}`} />
                      {!!u.unreadCount && (
                        <span
                          className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-lg ${
                            isDark ? "bg-emerald-500 shadow-emerald-500/40" : "bg-emerald-600 shadow-emerald-500/30"
                          }`}
                        >
                          {u.unreadCount > 99 ? "99+" : u.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative mb-4 shrink-0">
            <FiSearch className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg ${isDark ? "text-slate-400/80" : "text-slate-500"}`} />
            <input
              className={`w-full rounded-full py-3 pl-12 pr-4 text-sm outline-none transition focus:border-violet-400 ${
                isDark
                  ? "border border-white/10 bg-white/10 text-slate-200 placeholder:text-slate-400"
                  : "border border-slate-300 bg-white/90 text-slate-800 placeholder:text-slate-500"
              }`}
              placeholder="Search name"
              value={callSearch}
              onChange={(e) => setCallSearch(e.target.value)}
            />
          </div>
          <p className={`mb-3 shrink-0 px-1 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>Recent calls</p>
          <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
          {filteredCalls.length ? (
            filteredCalls.map((call) => {
              const statusClass =
                call.status === "missed"
                  ? "text-rose-400"
                  : call.status === "received"
                    ? "text-emerald-500"
                    : isDark
                      ? "text-sky-300"
                      : "text-sky-600";
              return (
                <div
                  key={call.id}
                  className={`rounded-xl border px-2 py-2 ${
                    isDark ? "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5" : "border-transparent hover:border-slate-300 hover:bg-slate-100/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ProfileAvatar src={call.profilePic} name={call.name} className="h-11 w-11 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{call.name}</p>
                      <p className={`flex items-center gap-1 truncate text-[11px] ${statusClass}`}>
                        {call.type === "video" ? <FiVideo /> : <FiPhone />}
                        {call.statusLabel} - {call.time}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={`rounded-2xl px-3 py-8 text-center text-sm ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
              {callSearch.trim() ? "No matching calls found." : "No call history yet."}
            </div>
          )}
          </div>
        </div>
      )}
    </aside>
  );
}
