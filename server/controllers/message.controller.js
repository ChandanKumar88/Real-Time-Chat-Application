const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const { cloudinary } = require("../config/cloudinary");
const { getSocketIdsByUserId } = require("../socket/presenceStore");
const { sendMessagePushNotification } = require("../utils/pushNotifications");

function getUploadSignature(_req, res) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = "chat-app/messages";
  const timestamp = Math.round(Date.now() / 1000);

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ success: false, message: "Cloudinary upload is not configured" });
  }

  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret);

  res.json({
    success: true,
    data: {
      cloudName,
      apiKey,
      folder,
      timestamp,
      signature,
    },
  });
}

async function getConversation(req, res) {
  const { userId } = req.params;
  const myId = req.user.id;
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isNaN(requestedLimit) ? 50 : requestedLimit, 1), 80);
  const before = req.query.before ? new Date(req.query.before) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation user" });
  }
  if (req.query.before && Number.isNaN(before.getTime())) {
    return res.status(400).json({ success: false, message: "Invalid message cursor" });
  }

  const conversationQuery = {
    hiddenFor: { $ne: myId },
    $or: [
      { senderId: myId, receiverId: userId },
      { senderId: userId, receiverId: myId },
    ],
  };
  if (before) conversationQuery.createdAt = { $lt: before };

  const messages = await Message.find(conversationQuery)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = messages.length > limit;
  const pageMessages = messages.slice(0, limit).reverse();

  res.json({
    success: true,
    data: pageMessages,
    pagination: {
      hasMore,
      nextBefore: pageMessages[0]?.createdAt || null,
    },
  });
}

async function sendMessage(req, res) {
  const { userId } = req.params;
  const text = req.body.text?.trim?.() || "";
  const encryptedPayload = req.body.encryptedPayload?.trim?.() || "";
  const image = req.body.image || "";
  const video = req.body.video || "";
  const forwardedImageUrl = req.body.imageUrl || "";
  const forwardedVideoUrl = req.body.videoUrl || "";
  const replyTo = req.body.replyTo || null;
  const isForwarded = Boolean(req.body.isForwarded);
  const originalMessageId = req.body.originalMessageId || null;

  if (!text && !encryptedPayload && !image && !video && !forwardedImageUrl && !forwardedVideoUrl) {
    return res.status(400).json({ success: false, message: "Message cannot be empty" });
  }
  if (replyTo && !mongoose.isValidObjectId(replyTo)) {
    return res.status(400).json({ success: false, message: "Invalid reply message" });
  }
  if (originalMessageId && !mongoose.isValidObjectId(originalMessageId)) {
    return res.status(400).json({ success: false, message: "Invalid original message" });
  }

  const [sender, receiver] = await Promise.all([
    User.findById(req.user.id).select("fullName profilePic publicKey blockedUsers"),
    User.findById(userId).select("publicKey blockedUsers"),
  ]);

  if (!receiver) {
    return res.status(404).json({ success: false, message: "Receiver not found" });
  }
  const senderBlockedReceiver = sender?.blockedUsers?.some((id) => id.toString() === userId);
  const receiverBlockedSender = receiver?.blockedUsers?.some((id) => id.toString() === req.user.id);
  if (senderBlockedReceiver || receiverBlockedSender) {
    return res.status(403).json({ success: false, message: "You cannot message this user" });
  }

  let replyMessageId = null;
  if (replyTo) {
    const replyMessage = await Message.findOne({
      _id: replyTo,
      $or: [
        { senderId: req.user.id, receiverId: userId },
        { senderId: userId, receiverId: req.user.id },
      ],
    }).select("_id");

    if (!replyMessage) {
      return res.status(404).json({ success: false, message: "Reply message not found" });
    }
    replyMessageId = replyMessage._id;
  }

  let originalMessage = null;
  if (originalMessageId) {
    originalMessage = await Message.findOne({
      _id: originalMessageId,
      $or: [
        { senderId: req.user.id },
        { receiverId: req.user.id },
      ],
    }).select("_id senderId");

    if (!originalMessage) {
      return res.status(404).json({ success: false, message: "Original message not found" });
    }
  }

  let imageUrl = forwardedImageUrl;
  if (image && !imageUrl) {
    const uploaded = await cloudinary.uploader.upload(image, {
      folder: "chat-app/messages",
    });
    imageUrl = uploaded.secure_url;
  }

  let videoUrl = forwardedVideoUrl;
  if (video && !videoUrl) {
    const uploadedVideo = await cloudinary.uploader.upload(video, {
      folder: "chat-app/messages",
      resource_type: "video",
    });
    videoUrl = uploadedVideo.secure_url;
  }

  const message = await Message.create({
    senderId: req.user.id,
    receiverId: userId,
    replyTo: replyMessageId,
    text: encryptedPayload ? "" : text,
    encryptedPayload,
    encrypted: Boolean(encryptedPayload),
    encryptionVersion: encryptedPayload ? 1 : 0,
    senderPublicKey: sender?.publicKey || "",
    receiverPublicKey: receiver?.publicKey || "",
    image: imageUrl,
    video: videoUrl,
    isForwarded,
    forwardedFrom: isForwarded ? originalMessage?.senderId || req.user.id : null,
    originalMessageId: originalMessage?._id || null,
  });

  const io = req.app.get("io");
  const receiverSocketIds = getSocketIdsByUserId(userId);
  if (receiverSocketIds.length > 0) {
    io.to(receiverSocketIds).emit("message:new", message);
  }

  sendMessagePushNotification({
    receiverId: userId,
    sender,
    message,
  }).catch(() => null);

  res.status(201).json({ success: true, data: message });
}

async function markSeen(req, res) {
  const { messageId } = req.params;
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({ success: false, message: "Message not found" });
  }
  if (message.receiverId.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: "Not allowed" });
  }

  message.seen = true;
  message.seenAt = new Date();
  await message.save();

  const io = req.app.get("io");
  const senderSocketIds = getSocketIdsByUserId(message.senderId.toString());
  if (senderSocketIds.length > 0) {
    io.to(senderSocketIds).emit("message:seen", message);
  }

  res.json({ success: true, message: "Marked as seen", data: message });
}

async function deleteMessage(req, res) {
  const { messageId } = req.params;
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({ success: false, message: "Message not found" });
  }

  if (message.senderId.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: "You can only delete your own messages" });
  }

  await Message.findByIdAndDelete(messageId);

  const io = req.app.get("io");
  const receiverSocketIds = getSocketIdsByUserId(message.receiverId.toString());
  if (receiverSocketIds.length > 0) {
    io.to(receiverSocketIds).emit("message:deleted", { messageId });
  }

  res.json({ success: true, message: "Message deleted", data: { messageId } });
}

async function clearConversation(req, res) {
  const { userId } = req.params;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation user" });
  }

  await Message.deleteMany({
    $or: [
      { senderId: req.user.id, receiverId: userId },
      { senderId: userId, receiverId: req.user.id },
    ],
  });

  const io = req.app.get("io");
  const receiverSocketIds = getSocketIdsByUserId(userId);
  if (receiverSocketIds.length > 0) {
    io.to(receiverSocketIds).emit("message:conversationDeleted", { userId: req.user.id });
  }

  res.json({ success: true, message: "Chat cleared", data: { userId } });
}

async function deleteConversation(req, res) {
  const { userId } = req.params;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation user" });
  }

  await Message.deleteMany({
    $or: [
      { senderId: req.user.id, receiverId: userId },
      { senderId: userId, receiverId: req.user.id },
    ],
  });

  const io = req.app.get("io");
  const receiverSocketIds = getSocketIdsByUserId(userId);
  if (receiverSocketIds.length > 0) {
    io.to(receiverSocketIds).emit("message:conversationDeleted", { userId: req.user.id });
  }

  res.json({ success: true, message: "Chat deleted", data: { userId } });
}

module.exports = { getConversation, getUploadSignature, sendMessage, markSeen, deleteMessage, clearConversation, deleteConversation };
