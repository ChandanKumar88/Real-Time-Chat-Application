/**
 * Cloudinary & Media Optimization Utility
 * - Automatically optimizes images with WebP/AVIF format and responsive compression.
 * - Leaves video stream URLs clean for smooth native browser range-buffering without stutter/stalling.
 * - Generates instant first-frame poster thumbnails for videos.
 */

export function getOptimizedMediaUrl(url, options = {}) {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Base64 data URLs or local blob URLs don't need transformation
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // If this is a video URL, keep it clean so native video player streams smoothly via byte-range requests
  const isVideoUrl =
    trimmed.includes("/video/upload/") ||
    /\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i.test(trimmed);

  if (isVideoUrl) {
    // If it was previously injected with f_auto or q_auto, strip them to restore smooth streaming
    if (trimmed.includes("/upload/f_auto") || trimmed.includes("/upload/q_auto")) {
      return trimmed.replace(/\/upload\/(f_auto|q_auto)[^/]*\//, "/upload/");
    }
    return trimmed;
  }

  // Only apply Cloudinary transformations to Cloudinary hosted media
  if (!trimmed.includes("res.cloudinary.com")) {
    return trimmed;
  }

  const {
    width,
    height,
    crop = "limit",
    quality = "auto:good",
    format = "auto",
    isProfile = false,
  } = options;

  const uploadIndex = trimmed.indexOf("/upload/");
  if (uploadIndex === -1) return trimmed;

  const prefix = trimmed.substring(0, uploadIndex + 8);
  const rest = trimmed.substring(uploadIndex + 8);

  // If already optimized, return as is
  if (rest.startsWith("f_auto") || rest.startsWith("q_auto")) {
    return trimmed;
  }

  const transforms = [`f_${format}`, `q_${quality}`];
  if (isProfile) {
    transforms.push("c_fill", "g_face");
    if (width) transforms.push(`w_${width}`);
    if (height) transforms.push(`h_${height || width}`);
  } else {
    if (width) transforms.push(`w_${width}`, `c_${crop}`);
    if (height) transforms.push(`h_${height}`);
  }

  return `${prefix}${transforms.join(",")}/${rest}`;
}

export function getVideoPosterUrl(videoUrl, options = {}) {
  if (!videoUrl || typeof videoUrl !== "string") return "";
  const trimmed = videoUrl.trim();
  if (!trimmed.includes("res.cloudinary.com") || !trimmed.includes("/video/upload/")) {
    return "";
  }

  const { width = 480 } = options;
  // Strip any existing transforms before injecting poster transform
  let clean = trimmed;
  if (clean.includes("/upload/f_auto") || clean.includes("/upload/q_auto")) {
    clean = clean.replace(/\/upload\/(f_auto|q_auto)[^/]*\//, "/upload/");
  }

  return clean
    .replace("/video/upload/", `/video/upload/so_0,f_auto,q_auto:good,w_${width},c_limit/`)
    .replace(/\.[^/.]+$/, ".jpg");
}
