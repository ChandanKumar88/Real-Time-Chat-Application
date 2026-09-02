import { useEffect, useMemo, useState } from "react";
import { getOptimizedMediaUrl } from "../utils/mediaUrl";

export default function ProfileAvatar({ src, name = "User", className = "" }) {
  const [hasError, setHasError] = useState(false);
  const normalizedSrc = typeof src === "string" ? src.trim() : "";
  const optimizedSrc = useMemo(() => {
    return getOptimizedMediaUrl(normalizedSrc, { width: 160, isProfile: true });
  }, [normalizedSrc]);
  const showImage = optimizedSrc && !hasError;

  useEffect(() => {
    setHasError(false);
  }, [optimizedSrc]);

  const initial = useMemo(() => {
    const trimmed = (name || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "U";
  }, [name]);

  if (showImage) {
    return (
      <img
        src={optimizedSrc}
        alt={name}
        className={className}
        loading="lazy"
        decoding="async"
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
