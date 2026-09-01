import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

// 1. Standard App Icon SVG (with rounded squircle corners for standard viewing)
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="qc-brand-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#9333ea" />
      <stop offset="100%" stop-color="#d946ef" />
    </linearGradient>
    <filter id="qc-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#a855f7" flood-opacity="0.35" />
    </filter>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="120" ry="120" fill="url(#qc-brand-gradient)" filter="url(#qc-shadow)" />
  <g transform="translate(106, 106) scale(15)">
    <path fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 0 0 1.33 0l1.713-3.293a.783.783 0 0 1 .642-.413 41.102 41.102 0 0 0 3.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2ZM6.75 6a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
  </g>
</svg>`;

// 2. Maskable PWA Icon SVG (Full bleed gradient background + centered icon in safe zone, perfect for Android Adaptive Icons)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="qc-mask-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#9333ea" />
      <stop offset="100%" stop-color="#d946ef" />
    </linearGradient>
  </defs>
  <!-- Full bleed edge-to-edge gradient background for maskable adaptive masking -->
  <rect x="0" y="0" width="512" height="512" fill="url(#qc-mask-gradient)" />
  <!-- Centered Chat Bubble placed strictly in Android Safe Zone -->
  <g transform="translate(131, 131) scale(12.5)">
    <path fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 0 0 1.33 0l1.713-3.293a.783.783 0 0 1 .642-.413 41.102 41.102 0 0 0 3.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2ZM6.75 6a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
  </g>
</svg>`;

async function generate() {
  console.log("Generating PWA and shortcut PNG icons...");

  // Generate 512x512 standard icon
  await sharp(Buffer.from(standardSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, "pwa-512x512.png"));

  // Generate 192x192 standard icon
  await sharp(Buffer.from(standardSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, "pwa-192x192.png"));

  // Generate 512x512 maskable icon for Android Adaptive Icons
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, "pwa-maskable-512x512.png"));

  // Generate 192x192 maskable icon for Android
  await sharp(Buffer.from(maskableSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, "pwa-maskable-192x192.png"));

  // Generate 180x180 Apple Touch Icon for iOS Safari
  await sharp(Buffer.from(maskableSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));

  // Generate 32x32 and 16x16 PNGs for fallback favicon
  await sharp(Buffer.from(standardSvg))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, "favicon-32x32.png"));

  await sharp(Buffer.from(standardSvg))
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, "favicon-16x16.png"));

  console.log("All PWA PNG icons generated successfully in public/!");
}

generate().catch(console.error);
