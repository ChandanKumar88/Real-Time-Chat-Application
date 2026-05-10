const crypto = require("crypto");
const mongoose = require("mongoose");
const CallEvent = require("../models/CallEvent");

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

async function listCallEvents(req, res) {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - CALL_EVENT_TTL_MS);
  const safeSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - CALL_EVENT_TTL_MS) : since;

  const events = await CallEvent.find({
    to: req.user.id,
    createdAt: { $gt: safeSince },
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
  listCallEvents,
};
