const Message = require("../models/Message");
const { cloudinary } = require("../config/cloudinary");
const { getSocketIdByUserId } = require("../socket/presenceStore");

async function getConversation(req, res) {
  const { userId } = req.params;
  const myId = req.user.id;
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
  const { text = "", image = "", video = "" } = req.body;
  if (!text && !image && !video) {
    return res.status(400).json({ success: false, message: "Message cannot be empty" });
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
    text,
    image: imageUrl,
    video: videoUrl,
  });

  const io = req.app.get("io");
  const receiverSocketId = getSocketIdByUserId(userId);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("message:new", message);
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
  const senderSocketId = getSocketIdByUserId(message.senderId.toString());
  if (senderSocketId) {
    io.to(senderSocketId).emit("message:seen", message);
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
  const receiverSocketId = getSocketIdByUserId(message.receiverId.toString());
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("message:deleted", { messageId });
  }

  res.json({ success: true, message: "Message deleted", data: { messageId } });
}

module.exports = { getConversation, sendMessage, markSeen, deleteMessage };
