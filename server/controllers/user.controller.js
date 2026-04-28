const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");
const TypingStatus = require("../models/TypingStatus");
const { cloudinary } = require("../config/cloudinary");
const { getOnlineUserIds } = require("../socket/presenceStore");

const ONLINE_GRACE_MS = 60 * 1000;
const TYPING_GRACE_MS = 4500;

function isRecentlyOnline(user) {
  return Boolean(user.isOnline) && user.lastSeen && Date.now() - new Date(user.lastSeen).getTime() <= ONLINE_GRACE_MS;
}

async function listUsers(req, res) {
  const users = await User.find({ _id: { $ne: req.user.id } }).select("-password").sort({ isOnline: -1, fullName: 1 });
  const onlineIds = new Set(getOnlineUserIds());
  const unreadAgg = await Message.aggregate([
    { $match: { receiverId: new mongoose.Types.ObjectId(req.user.id), seen: false } },
    { $group: { _id: "$senderId", count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unreadAgg.map((item) => [item._id.toString(), item.count]));

  const enriched = users
    .map((u) => {
      const userObject = u.toObject();
      const userId = u._id.toString();
      return {
        ...userObject,
        isOnline: onlineIds.has(userId) || isRecentlyOnline(userObject),
        unreadCount: unreadMap.get(userId) || 0,
      };
    })
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.fullName.localeCompare(b.fullName));
  res.json({ success: true, data: enriched });
}

async function searchUsers(req, res) {
  const q = (req.query.q || "").trim();
  const regex = new RegExp(q, "i");
  const users = await User.find({
    _id: { $ne: req.user.id },
    $or: [{ fullName: regex }, { email: regex }],
  })
    .select("-password")
    .limit(20);
  const onlineIds = new Set(getOnlineUserIds());
  res.json({
    success: true,
    data: users.map((u) => {
      const userObject = u.toObject();
      return { ...userObject, isOnline: onlineIds.has(u._id.toString()) || isRecentlyOnline(userObject) };
    }),
  });
}

async function markPresenceOnline(req, res) {
  await User.findByIdAndUpdate(req.user.id, { isOnline: true, lastSeen: new Date() });
  res.json({ success: true });
}

async function updateTypingStatus(req, res) {
  const { receiverId, isTyping } = req.body;

  if (!receiverId || !mongoose.isValidObjectId(receiverId)) {
    return res.status(400).json({ success: false, message: "Invalid receiver" });
  }

  if (isTyping) {
    await TypingStatus.findOneAndUpdate(
      { senderId: req.user.id, receiverId },
      {
        senderId: req.user.id,
        receiverId,
        isTyping: true,
        expiresAt: new Date(Date.now() + TYPING_GRACE_MS),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    await TypingStatus.deleteOne({ senderId: req.user.id, receiverId });
  }

  res.json({ success: true });
}

async function getTypingStatus(req, res) {
  const { userId } = req.params;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ success: false, message: "Invalid user" });
  }

  const status = await TypingStatus.findOne({
    senderId: userId,
    receiverId: req.user.id,
    isTyping: true,
    expiresAt: { $gt: new Date() },
  });

  res.json({ success: true, data: { userId, isTyping: Boolean(status) } });
}

async function updateProfile(req, res) {
  const { fullName, bio, profilePic } = req.body;
  const updates = {};
  let uploadedProfilePic = "";

  if (fullName) updates.fullName = fullName;
  if (typeof bio === "string") updates.bio = bio;

  try {
    if (profilePic) {
      const uploadResult = await cloudinary.uploader.upload(profilePic, {
        folder: "chat-app/profiles",
      });
      uploadedProfilePic = uploadResult.secure_url;
      updates.profilePic = uploadedProfilePic;
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");
  res.json({ success: true, message: "Profile updated", data: user });
}

async function deleteAccount(req, res) {
  const userId = req.user.id;

  await Message.deleteMany({
    $or: [{ senderId: userId }, { receiverId: userId }],
  });

  await User.findByIdAndDelete(userId);

  res.json({ success: true, message: "Account deleted successfully" });
}

module.exports = { listUsers, searchUsers, markPresenceOnline, updateTypingStatus, getTypingStatus, updateProfile, deleteAccount };
