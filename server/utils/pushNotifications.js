const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

let vapidConfigured = false;

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.SMTP_USER ? `mailto:${process.env.SMTP_USER}` : "mailto:support@quickchat.local");

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function shouldRemovePushSubscription(error) {
  return [400, 403, 404, 410].includes(error?.statusCode);
}

function logPushFailure(error, context) {
  if (process.env.NODE_ENV === "test") return;
  const status = error?.statusCode ? ` status=${error.statusCode}` : "";
  const body = error?.body ? ` body=${error.body}` : "";
  console.warn(`Push notification failed${context ? ` (${context})` : ""}.${status}${body}`);
}

function getMessageNotificationBody(message) {
  if (message.image) return "Photo";
  if (message.video) return "Video";
  if (message.callType) return message.callType === "video" ? "Video call" : "Voice call";
  if (message.encrypted || message.encryptedPayload) return "New encrypted message";
  return message.text || "New message";
}

async function sendMessagePushNotification({ receiverId, sender, message }) {
  if (!receiverId || !sender || !message || !configureWebPush()) return;

  const subscriptions = await PushSubscription.find({ userId: receiverId }).lean();
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: sender.fullName || "QuickChat",
    body: getMessageNotificationBody(message),
    icon: sender.profilePic || "/favicon.svg",
    badge: "/favicon.svg",
    url: "/",
    tag: `quickchat-message-${sender._id || message.senderId}`,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload
        );
      } catch (error) {
        logPushFailure(error, "message");
        if (shouldRemovePushSubscription(error)) {
          await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
        }
      }
    })
  );
}

async function sendCallPushNotification({ receiverId, caller, callId, callType = "audio" }) {
  if (!receiverId || !caller || !callId || !configureWebPush()) return;

  const subscriptions = await PushSubscription.find({ userId: receiverId }).lean();
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    type: "incoming-call",
    title: caller.fullName || "QuickChat",
    body: callType === "video" ? "Incoming video call" : "Incoming voice call",
    icon: caller.profilePic || "/favicon.svg",
    badge: "/favicon.svg",
    url: "/",
    tag: `quickchat-call-${callId}`,
    requireInteraction: true,
    vibrate: [500, 180, 500, 180, 900, 250, 900],
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload,
          { TTL: 45 }
        );
      } catch (error) {
        logPushFailure(error, "call");
        if (shouldRemovePushSubscription(error)) {
          await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
        }
      }
    })
  );
}

module.exports = {
  getVapidPublicKey,
  sendCallPushNotification,
  sendMessagePushNotification,
};
