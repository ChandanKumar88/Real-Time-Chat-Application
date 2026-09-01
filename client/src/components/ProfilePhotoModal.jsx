import { useEffect } from "react";
import { FiX } from "react-icons/fi";

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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 sm:p-6 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} profile photo`}
    >
      <div
        className="relative max-h-[85vh] max-w-[90vw] sm:max-w-[420px] md:max-w-[460px] overflow-hidden rounded-3xl border border-white/15 bg-[#0e101c] shadow-[0_25px_65px_rgba(0,0,0,0.9)] transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3.5 top-3.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur-md transition hover:bg-black/80 hover:text-white active:scale-95"
          aria-label="Close photo preview"
          title="Close"
        >
          <FiX className="text-xl" />
        </button>

        {/* Pure Profile Picture View */}
        <div className="relative aspect-square w-full min-w-[280px] max-w-[460px] flex items-center justify-center overflow-hidden bg-black/70">
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
    </div>
  );
}
