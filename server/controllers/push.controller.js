const PushSubscription = require("../models/PushSubscription");
const { getVapidPublicKey } = require("../utils/pushNotifications");

function getPublicKey(_req, res) {
  const publicKey = getVapidPublicKey();
  res.json({
    success: true,
    data: {
      publicKey,
      enabled: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY),
    },
  });
}

async function saveSubscription(req, res) {
  const subscription = req.body?.subscription || req.body;
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys || {};

  if (!endpoint || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ success: false, message: "Invalid push subscription" });
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      userId: req.user.id,
      endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      userAgent: req.get("user-agent") || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, message: "Push notifications enabled" });
}

async function removeSubscription(req, res) {
  const endpoint = req.body?.endpoint || req.query?.endpoint;
  if (!endpoint) {
    return res.status(400).json({ success: false, message: "Push endpoint is required" });
  }

  await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
  res.json({ success: true, message: "Push notifications disabled" });
}

module.exports = { getPublicKey, saveSubscription, removeSubscription };
