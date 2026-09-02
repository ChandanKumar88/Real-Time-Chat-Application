/**
 * Cloudinary & Media Optimization Utility
 * Adds automatic WebP/AVIF format negotiation, intelligent compression,
 * and responsive dimension scaling to eliminate media loading delays.
 */

export function getOptimizedMediaUrl(url, options = {}) {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Base64 data URLs or local blob URLs don't need transformation
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
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
  return trimmed
    .replace("/video/upload/", `/video/upload/so_0,f_auto,q_auto:good,w_${width},c_limit/`)
    .replace(/\.[^/.]+$/, ".jpg");
}
