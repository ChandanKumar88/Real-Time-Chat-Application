const KEY_ALGORITHM = { name: "ECDH", namedCurve: "P-256" };
const STORAGE_PREFIX = "quickchat_e2ee_keypair_";
const ENCRYPTION_VERSION = 1;
const BACKUP_VERSION = 1;
const BACKUP_ITERATIONS = 250000;

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function stringToArrayBuffer(value) {
  return new TextEncoder().encode(value);
}

function arrayBufferToString(buffer) {
  return new TextDecoder().decode(buffer);
}

function saveLocalKeyPair(userId, keyPair) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(keyPair));
}

export function getLocalKeyPair(userId) {
  if (!userId) return null;

  try {
    const saved = localStorage.getItem(getStorageKey(userId));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

async function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey("jwk", privateJwk, KEY_ALGORITHM, false, ["deriveKey"]);
}

async function importPublicKey(publicKeyString) {
  return crypto.subtle.importKey("jwk", JSON.parse(publicKeyString), KEY_ALGORITHM, false, []);
}

async function deriveConversationKey(privateKey, peerPublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveBackupKey(password, saltBuffer) {
  const passwordKey = await crypto.subtle.importKey("raw", stringToArrayBuffer(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: BACKUP_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function createEncryptedKeyBackup(privateJwk, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const backupKey = await deriveBackupKey(password, salt);
  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    backupKey,
    stringToArrayBuffer(JSON.stringify(privateJwk))
  );

  return JSON.stringify({
    v: BACKUP_VERSION,
    alg: "PBKDF2-SHA256-AESGCM",
    iterations: BACKUP_ITERATIONS,
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encryptedPrivateKey),
  });
}

async function decryptKeyBackup(encryptionKeyBackup, password) {
  const backup = JSON.parse(encryptionKeyBackup);
  if (backup.v !== BACKUP_VERSION || backup.alg !== "PBKDF2-SHA256-AESGCM") {
    throw new Error("Unsupported encrypted chat backup");
  }

  const salt = base64ToArrayBuffer(backup.salt);
  const iv = base64ToArrayBuffer(backup.iv);
  const backupKey = await deriveBackupKey(password, salt);
  const privateKeyJson = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    backupKey,
    base64ToArrayBuffer(backup.data)
  );

  return JSON.parse(arrayBufferToString(privateKeyJson));
}

export async function ensureLocalKeyPair(userId) {
  if (!window.crypto?.subtle) {
    throw new Error("This browser does not support secure encryption");
  }

  const saved = getLocalKeyPair(userId);
  if (saved) return saved;

  const keyPair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const storedKeyPair = {
    publicKey: JSON.stringify(publicJwk),
    privateJwk,
  };

  saveLocalKeyPair(userId, storedKeyPair);
  return storedKeyPair;
}

export async function ensureRecoverableKeyPair({ userId, password, publicKey, encryptionKeyBackup }) {
  if (!password) {
    return { keyPair: await ensureLocalKeyPair(userId), encryptionKeyBackup: encryptionKeyBackup || "", shouldSync: false };
  }

  if (publicKey && encryptionKeyBackup) {
    const localKeyPair = getLocalKeyPair(userId);
    if (localKeyPair?.publicKey === publicKey) {
      return { keyPair: localKeyPair, encryptionKeyBackup, shouldSync: false };
    }

    const privateJwk = await decryptKeyBackup(encryptionKeyBackup, password);
    const restoredKeyPair = { publicKey, privateJwk };
    saveLocalKeyPair(userId, restoredKeyPair);
    return { keyPair: restoredKeyPair, encryptionKeyBackup, shouldSync: false };
  }

  if (publicKey) {
    const localKeyPair = getLocalKeyPair(userId);
    if (localKeyPair?.publicKey !== publicKey) {
      throw new Error("Encrypted chat key is missing on this device");
    }

    const backup = await createEncryptedKeyBackup(localKeyPair.privateJwk, password);
    return {
      keyPair: localKeyPair,
      encryptionKeyBackup: backup,
      shouldSync: true,
    };
  }

  const activeKeyPair = await ensureLocalKeyPair(userId);
  const backup = await createEncryptedKeyBackup(activeKeyPair.privateJwk, password);

  return {
    keyPair: activeKeyPair,
    encryptionKeyBackup: backup,
    shouldSync: activeKeyPair.publicKey !== publicKey || backup !== encryptionKeyBackup,
  };
}

export async function encryptText({ text, myUserId, peerPublicKey }) {
  if (!text?.trim()) return "";
  if (!peerPublicKey) {
    throw new Error("Receiver encryption key is not available yet");
  }

  const localKeyPair = await ensureLocalKeyPair(myUserId);
  const privateKey = await importPrivateKey(localKeyPair.privateJwk);
  const publicKey = await importPublicKey(peerPublicKey);
  const conversationKey = await deriveConversationKey(privateKey, publicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, conversationKey, encodedText);

  return JSON.stringify({
    v: ENCRYPTION_VERSION,
    alg: "ECDH-P256-AESGCM",
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
  });
}

export async function decryptText({ encryptedPayload, myUserId, peerPublicKey }) {
  if (!encryptedPayload) return "";
  if (!peerPublicKey) {
    return null;
  }

  try {
    const payload = JSON.parse(encryptedPayload);
    const localKeyPair = getLocalKeyPair(myUserId);
    if (!localKeyPair) return null;

    const privateKey = await importPrivateKey(localKeyPair.privateJwk);
    const publicKey = await importPublicKey(peerPublicKey);
    const conversationKey = await deriveConversationKey(privateKey, publicKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(payload.iv)) },
      conversationKey,
      base64ToArrayBuffer(payload.data)
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

export async function deriveCallMediaKey({ myUserId, peerPublicKey, callId }) {
  if (!myUserId || !peerPublicKey || !callId) {
    throw new Error("Call encryption key material is missing");
  }

  const localKeyPair = getLocalKeyPair(myUserId);
  if (!localKeyPair) {
    throw new Error("Encrypted chat key is missing on this device");
  }

  const privateKey = await importPrivateKey(localKeyPair.privateJwk);
  const publicKey = await importPublicKey(peerPublicKey);
  const key = await deriveConversationKey(privateKey, publicKey);

  return {
    key,
    additionalData: new TextEncoder().encode(`quickchat-call-media-frame-v1:${callId}`),
  };
}

export async function encryptMediaBuffer(fileBuffer, mimeType = "application/octet-stream", fileName = "media") {
  const mediaKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    mediaKey,
    fileBuffer
  );

  const exportedRawKey = await crypto.subtle.exportKey("raw", mediaKey);
  const encryptedBlob = new Blob([encryptedBuffer], { type: "application/octet-stream" });

  return {
    encryptedBlob,
    encryptedBuffer,
    mediaKeyBase64: arrayBufferToBase64(exportedRawKey),
    ivBase64: arrayBufferToBase64(iv),
    mimeType,
    fileName,
    size: fileBuffer.byteLength,
  };
}

export async function encryptMediaFile(file) {
  const fileBuffer = await file.arrayBuffer();
  return encryptMediaBuffer(fileBuffer, file.type || "application/octet-stream", file.name || "media");
}

export async function decryptMediaBuffer({ encryptedBuffer, mediaKeyBase64, ivBase64, mimeType = "application/octet-stream" }) {
  const rawKey = base64ToArrayBuffer(mediaKeyBase64);
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const mediaKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    mediaKey,
    encryptedBuffer
  );

  return new Blob([decryptedBuffer], { type: mimeType });
}

export async function encryptMessagePayload({ payload, myUserId, peerPublicKey }) {
  const textContent = typeof payload === "string" ? payload : JSON.stringify(payload);
  return encryptText({ text: textContent, myUserId, peerPublicKey });
}

export async function decryptMessagePayload({ encryptedPayload, myUserId, peerPublicKey }) {
  const text = await decryptText({ encryptedPayload, myUserId, peerPublicKey });
  if (text === null) return null;
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && (parsed.media || parsed.text !== undefined)) {
      return parsed;
    }
  } catch {
    // Plain text string
  }
  return text;
}

