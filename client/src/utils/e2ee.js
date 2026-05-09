const KEY_ALGORITHM = { name: "ECDH", namedCurve: "P-256" };
const STORAGE_PREFIX = "quickchat_e2ee_keypair_";
const ENCRYPTION_VERSION = 1;

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

export async function ensureLocalKeyPair(userId) {
  if (!window.crypto?.subtle) {
    throw new Error("This browser does not support secure encryption");
  }

  const storageKey = getStorageKey(userId);
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    return JSON.parse(saved);
  }

  const keyPair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const storedKeyPair = {
    publicKey: JSON.stringify(publicJwk),
    privateJwk,
  };

  localStorage.setItem(storageKey, JSON.stringify(storedKeyPair));
  return storedKeyPair;
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
    return "[Encrypted message - key unavailable]";
  }

  try {
    const payload = JSON.parse(encryptedPayload);
    const localKeyPair = await ensureLocalKeyPair(myUserId);
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
    return "[Encrypted message - unable to decrypt on this device]";
  }
}
