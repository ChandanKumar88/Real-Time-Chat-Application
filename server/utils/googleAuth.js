const crypto = require("crypto");

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

let cachedKeys = new Map();
let cachedUntil = 0;

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function decodeJwtPart(value) {
  return JSON.parse(decodeBase64Url(value).toString("utf8"));
}

function getGoogleClientIds() {
  return [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_IDS]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getGoogleKey(kid) {
  const now = Date.now();
  if (cachedKeys.has(kid) && cachedUntil > now) {
    return cachedKeys.get(kid);
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error("Unable to fetch Google public keys");
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const { keys = [] } = await response.json();

  cachedKeys = new Map(
    keys.map((key) => [key.kid, crypto.createPublicKey({ key, format: "jwk" })])
  );
  cachedUntil = now + maxAge * 1000;

  return cachedKeys.get(kid);
}

async function verifyGoogleIdToken(credential) {
  if (!credential || typeof credential !== "string") {
    throw new Error("Google credential is required");
  }

  const parts = credential.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Google credential");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported Google credential");
  }

  const publicKey = await getGoogleKey(header.kid);
  if (!publicKey) {
    throw new Error("Google signing key not found");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const isSignatureValid = verifier.verify(publicKey, decodeBase64Url(encodedSignature));
  if (!isSignatureValid) {
    throw new Error("Invalid Google credential signature");
  }

  const allowedClientIds = getGoogleClientIds();
  if (allowedClientIds.length === 0) {
    throw new Error("Google client ID is not configured");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw new Error("Invalid Google credential issuer");
  }
  if (!allowedClientIds.includes(payload.aud)) {
    throw new Error("Invalid Google credential audience");
  }
  if (payload.exp <= nowInSeconds) {
    throw new Error("Google credential has expired");
  }
  if (payload.nbf && payload.nbf > nowInSeconds) {
    throw new Error("Google credential is not active yet");
  }
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("Google email is not verified");
  }

  return payload;
}

module.exports = { verifyGoogleIdToken };
