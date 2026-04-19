export async function processImageFile(file, options = {}) {
  const {
    maxWidth = 720,
    maxHeight = 720,
    quality = 0.8,
    cropSquare = false,
    mimeType = resolveMimeType(file, options.mimeType),
  } = options;

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const source = cropSquare ? getSquareCrop(img.width, img.height) : { sx: 0, sy: 0, sw: img.width, sh: img.height };
  const scale = Math.min(maxWidth / source.sw, maxHeight / source.sh, 1);
  const targetWidth = Math.max(1, Math.round(source.sw * scale));
  const targetHeight = Math.max(1, Math.round(source.sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, source.sx, source.sy, source.sw, source.sh, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL(mimeType, quality);
}

function resolveMimeType(file, requestedMimeType) {
  if (requestedMimeType) return requestedMimeType;

  const fileType = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";

  return "image/jpeg";
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function getSquareCrop(width, height) {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    sw: size,
    sh: size,
  };
}
