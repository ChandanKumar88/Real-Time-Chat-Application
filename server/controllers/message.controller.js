const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const { cloudinary } = require("../config/cloudinary");
const { getSocketIdsByUserId } = require("../socket/presenceStore");

async function getConversation(req, res) {
  const { userId } = req.params;
  const myId = req.user.id;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation user" });
  }

  const messages = await Message.find({
    $or: [
      { senderId: myId, receiverId: userId },
      { senderId: userId, receiverId: myId },
    ],
  }).sort({ createdAt: 1 });

  res.json({ success: true, data: messages });
}

async function sendMessage(req, res) {
  const { userId } = req.params;
  const text = req.body.text?.trim?.() || "";
  const encryptedPayload = req.body.encryptedPayload?.trim?.() || "";
  const image = req.body.image || "";
  const video = req.body.video || "";
  const replyTo = req.body.replyTo || null;

  if (!text && !encryptedPayload && !image && !video) {
    return res.status(400).json({ success: false, message: "Message cannot be empty" });
  }
  if (replyTo && !mongoose.isValidObjectId(replyTo)) {
    return res.status(400).json({ success: false, message: "Invalid reply message" });
  }

  const [sender, receiver] = await Promise.all([
    User.findById(req.user.id).select("publicKey"),
    User.findById(userId).select("publicKey"),
  ]);

  if (!receiver) {
    return res.status(404).json({ success: false, message: "Receiver not found" });
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

  let imageUrl = "";
  if (image) {
    const uploaded = await cloudinary.uploader.upload(image, {
      folder: "chat-app/messages",
    });
    imageUrl = uploaded.secure_url;
  }

  let videoUrl = "";
  if (video) {
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
  });

  const io = req.app.get("io");
  const receiverSocketIds = getSocketIdsByUserId(userId);
  if (receiverSocketIds.length > 0) {
    io.to(receiverSocketIds).emit("message:new", message);
  }

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

module.exports = { getConversation, sendMessage, markSeen, deleteMessage };
