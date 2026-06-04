const crypto = require("crypto");
const mongoose = require("mongoose");
const CallEvent = require("../models/CallEvent");
const Message = require("../models/Message");
const User = require("../models/User");
const { getSocketIdsByUserId } = require("../socket/presenceStore");
const { sendCallPushNotification } = require("../utils/pushNotifications");

const CALL_EVENT_TTL_MS = 2 * 60 * 1000;

function getExpiresAt() {
  return new Date(Date.now() + CALL_EVENT_TTL_MS);
}

function isValidUserId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function createCallEvent(req, res, type) {
  const { to, callId, ...payload } = req.body || {};

  if (!to || !isValidUserId(to)) {
    return res.status(400).json({ success: false, message: "Invalid call receiver" });
  }

  const nextCallId = type === "invite" ? crypto.randomUUID() : callId;
  if (!nextCallId) {
    return res.status(400).json({ success: false, message: "Call id is required" });
  }

  const event = await CallEvent.create({
    callId: nextCallId,
    from: req.user.id,
    to,
    type,
    payload,
    expiresAt: getExpiresAt(),
  });

  const io = req.app.get("io");
  const socketIds = getSocketIdsByUserId(to);
  if (io && socketIds.length > 0) {
    const realtimeEvent = event.toObject();
    socketIds.forEach((socketId) => io.to(socketId).emit("call:event", realtimeEvent));

    const eventNameMap = {
      invite: "incoming-call",
      accept: "call-accepted",
      reject: payload.reason === "busy" ? "user-busy" : payload.reason === "missed" ? "missed-call" : "call-rejected",
      end: "call-ended",
      ice: "call-ice",
    };
    const aliasName = eventNameMap[type];
    if (aliasName) {
      socketIds.forEach((socketId) => io.to(socketId).emit(aliasName, realtimeEvent));
    }
  }

  if (type === "invite") {
    const caller = await User.findById(req.user.id).select("fullName profilePic").lean();
    sendCallPushNotification({
      receiverId: to,
      caller: caller || payload.caller,
      callId: nextCallId,
      callType: payload.callType === "video" ? "video" : "audio",
    }).catch(() => null);
  }

  return res.status(201).json({ success: true, data: event });
}

async function inviteCall(req, res) {
  return createCallEvent(req, res, "invite");
}

async function acceptCall(req, res) {
  return createCallEvent(req, res, "accept");
}

async function sendIceCandidate(req, res) {
  return createCallEvent(req, res, "ice");
}

async function rejectCall(req, res) {
  return createCallEvent(req, res, "reject");
}

async function endCall(req, res) {
  return createCallEvent(req, res, "end");
}

async function logCallMessage(req, res) {
  const { peerId, callerId, callId, callType = "audio", callStatus = "outgoing", callDurationSeconds = 0 } = req.body || {};

  if (!peerId || !isValidUserId(peerId)) {
    return res.status(400).json({ success: false, message: "Invalid call peer" });
  }
  if (!callerId || !isValidUserId(callerId)) {
    return res.status(400).json({ success: false, message: "Invalid call sender" });
  }
  if (![req.user.id, peerId].includes(callerId)) {
    return res.status(403).json({ success: false, message: "Invalid call participant" });
  }
  if (!["audio", "video"].includes(callType)) {
    return res.status(400).json({ success: false, message: "Invalid call type" });
  }
  if (!["outgoing", "received", "missed"].includes(callStatus)) {
    return res.status(400).json({ success: false, message: "Invalid call status" });
  }

  const receiverId = callerId === req.user.id ? peerId : req.user.id;
  const safeDurationSeconds = Math.max(0, Math.floor(Number(callDurationSeconds) || 0));
  const safeCallId = callId || crypto.randomUUID();
  let message = await Message.findOne({ callId: safeCallId, callType });

  if (!message) {
    message = await Message.create({
      senderId: callerId,
      receiverId,
      callId: safeCallId,
      callType,
      callStatus,
      callDurationSeconds: safeDurationSeconds,
    });

    const io = req.app.get("io");
    const participantIds = new Set([callerId, receiverId]);
    participantIds.forEach((participantId) => {
      const socketIds = getSocketIdsByUserId(participantId);
      if (socketIds.length > 0) io.to(socketIds).emit("message:new", message);
    });
  }

  res.status(201).json({ success: true, data: message });
}

async function listCallEvents(req, res) {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - CALL_EVENT_TTL_MS);
  const safeSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - CALL_EVENT_TTL_MS) : since;

  const events = await CallEvent.find({
    to: req.user.id,
    createdAt: { $gte: safeSince },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  const nextSince = events.length > 0 ? events[events.length - 1].createdAt : safeSince;
  return res.json({ success: true, data: events, nextSince: nextSince.toISOString() });
}

module.exports = {
  inviteCall,
  acceptCall,
  sendIceCandidate,
  rejectCall,
  endCall,
  logCallMessage,
  listCallEvents,
};
