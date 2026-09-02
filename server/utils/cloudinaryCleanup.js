const { cloudinary } = require("../config/cloudinary");

/**
 * Extracts Cloudinary public_id from a secure_url
 * e.g. "https://res.cloudinary.com/cloud/image/upload/v12345/chat-app/messages/xyz.jpg" -> "chat-app/messages/xyz"
 */
function getPublicIdFromUrl(url) {
  if (!url || typeof url !== "string" || !url.includes("res.cloudinary.com")) return null;
  const uploadIndex = url.indexOf("/upload/");
  if (uploadIndex === -1) return null;

  const rest = url.substring(uploadIndex + 8);
  const parts = rest.split("/");
  // Remove dynamic transformations and version segments (e.g. "v12345678")
  const cleanParts = parts.filter(
    (part) =>
      !part.startsWith("f_") &&
      !part.startsWith("q_") &&
      !part.startsWith("w_") &&
      !part.startsWith("h_") &&
      !part.startsWith("c_") &&
      !part.startsWith("so_") &&
      !/^v\d+$/.test(part)
  );

  const fullPath = cleanParts.join("/");
  // Strip file extension (.png, .jpg, .mp4, .webp, etc.)
  return fullPath.replace(/\.[^/.]+$/, "");
}

/**
 * Permanently deletes media from Cloudinary storage
 */
async function deleteCloudinaryMedia(url, resourceType = "image") {
  try {
    const publicId = getPublicIdFromUrl(url);
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error("Cloudinary cleanup error:", err.message);
  }
}

module.exports = {
  getPublicIdFromUrl,
  deleteCloudinaryMedia,
};
