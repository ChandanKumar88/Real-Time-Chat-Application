import { useEffect } from "react";
import { FiX } from "react-icons/fi";
import ProfileAvatar from "./ProfileAvatar";

export default function ProfilePhotoModal({
  user,
  isOpen,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const displayName = user.fullName || user.name || "User";
  const avatarSrc = user.profilePic || "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} profile photo`}
    >
      {/* Screen Top-Left: User Info (WhatsApp style) */}
      <div
        className="absolute left-4 top-4 sm:left-6 sm:top-6 z-20 flex items-center gap-3 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <ProfileAvatar
          src={avatarSrc}
          name={displayName}
          className="h-10 w-10 rounded-full object-cover border border-white/20 shadow-md"
        />
        <span className="truncate max-w-[200px] sm:max-w-[320px] text-base font-semibold text-white/95 drop-shadow-sm">
          {displayName}
        </span>
      </div>

      {/* Screen Top-Right: Close Button (WhatsApp style) */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 sm:right-6 sm:top-6 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white active:scale-95"
        aria-label="Close photo preview"
        title="Close (Esc)"
      >
        <FiX className="text-2xl" />
      </button>

      {/* Center Image Container */}
      <div
        className="relative max-h-[75vh] max-w-[88vw] sm:max-h-[500px] sm:max-w-[500px] aspect-square w-full overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-[0_25px_65px_rgba(0,0,0,0.9)] transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="h-full w-full object-cover select-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 text-7xl font-bold text-white select-none">
            {displayName[0]?.toUpperCase() || "U"}
          </div>
        )}
      </div>
    </div>
  );
}
