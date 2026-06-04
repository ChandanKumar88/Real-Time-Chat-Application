import { api } from "../services/api";

let setupComplete = false;
let setupInFlight = false;
let retryTimer = null;
let firstInteractionListenerAdded = false;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer || []);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getPushPublicKey() {
  const { data } = await api.get("/push/public-key");
  return data.data?.publicKey || "";
}

async function getReadyServiceWorkerRegistration() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  registration.update?.().catch(() => null);
  return navigator.serviceWorker.ready;
}

function subscriptionUsesPublicKey(subscription, publicKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return true;
  return arrayBufferToBase64Url(currentKey) === publicKey;
}

function clearRetryTimer() {
  if (!retryTimer) return;
  window.clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  if (setupComplete || retryTimer || !isPushSupported()) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    subscribeCurrentBrowser({ requestPermission: false }).catch(() => scheduleRetry());
  }, 15000);
}

async function subscribeCurrentBrowser({ requestPermission = true } = {}) {
  if (!isPushSupported()) return false;
  if (setupInFlight) return false;

  setupInFlight = true;
  try {
    const publicKey = await getPushPublicKey();
    if (!publicKey) return false;

    const registration = await getReadyServiceWorkerRegistration();

    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return false;

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesPublicKey(subscription, publicKey)) {
      await subscription.unsubscribe().catch(() => null);
      subscription = null;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.post("/push/subscriptions", { subscription: subscription.toJSON() });
    setupComplete = true;
    clearRetryTimer();
    return true;
  } finally {
    setupInFlight = false;
  }
}

export function setupPushNotifications() {
  if (setupComplete || !isPushSupported()) return;

  if (Notification.permission === "granted") {
    subscribeCurrentBrowser({ requestPermission: false }).catch(() => scheduleRetry());
    return;
  }

  if (firstInteractionListenerAdded) return;
  firstInteractionListenerAdded = true;

  const handleFirstInteraction = () => {
    firstInteractionListenerAdded = false;
    subscribeCurrentBrowser().catch(() => scheduleRetry());
  };

  window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
  window.addEventListener("keydown", handleFirstInteraction, { once: true });
  window.addEventListener("focus", () => subscribeCurrentBrowser({ requestPermission: false }).catch(() => null), { once: true });
}

export async function unregisterPushNotifications() {
  if (!isPushSupported()) return;
  clearRetryTimer();

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  try {
    await api.delete("/push/subscriptions", {
      data: { endpoint: subscription.endpoint },
      skipSessionReplacedHandler: true,
    });
  } catch {
    // Logout should continue even if the server cannot remove the push endpoint.
  }

  await subscription.unsubscribe().catch(() => null);
  setupComplete = false;
  setupInFlight = false;
  firstInteractionListenerAdded = false;
}
