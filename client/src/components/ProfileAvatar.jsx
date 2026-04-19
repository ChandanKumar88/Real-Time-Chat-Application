import { useEffect, useMemo, useState } from "react";

export default function ProfileAvatar({ src, name = "User", className = "" }) {
  const [hasError, setHasError] = useState(false);
  const normalizedSrc = typeof src === "string" ? src.trim() : "";
  const showImage = normalizedSrc && !hasError;

  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  const initial = useMemo(() => {
    const trimmed = (name || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "U";
  }, [name]);

  if (showImage) {
    return (
      <img
        src={normalizedSrc}
        alt={name}
        className={className}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center rounded-full bg-slate-500 text-white ${className}`}
      title={name}
    >
      <span className="text-xs font-semibold">{initial}</span>
    </div>
  );
}
