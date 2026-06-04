import { api } from "../services/api";

let setupStarted = false;

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

function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getPushPublicKey() {
  const { data } = await api.get("/push/public-key");
  return data.data?.publicKey || "";
}

async function subscribeCurrentBrowser() {
  if (!isPushSupported()) return false;

  const publicKey = await getPushPublicKey();
  if (!publicKey) return false;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.post("/push/subscriptions", { subscription: subscription.toJSON() });
  return true;
}

export function setupPushNotifications() {
  if (setupStarted || !isPushSupported()) return;
  setupStarted = true;

  if (Notification.permission === "granted") {
    subscribeCurrentBrowser().catch(() => null);
    return;
  }

  const handleFirstInteraction = () => {
    subscribeCurrentBrowser().catch(() => null);
  };

  window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
  window.addEventListener("keydown", handleFirstInteraction, { once: true });
}

export async function unregisterPushNotifications() {
  if (!isPushSupported()) return;

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
  setupStarted = false;
}
