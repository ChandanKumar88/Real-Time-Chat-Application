const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null, index: true },
    text: { type: String, default: "" },
    encryptedPayload: { type: String, default: "" },
    encrypted: { type: Boolean, default: false },
    encryptionVersion: { type: Number, default: 0 },
    senderPublicKey: { type: String, default: "" },
    receiverPublicKey: { type: String, default: "" },
    image: { type: String, default: "" },
    video: { type: String, default: "" },
    callId: { type: String, default: "", index: true },
    callType: { type: String, enum: ["", "audio", "video"], default: "" },
    callStatus: { type: String, enum: ["", "outgoing", "received", "missed"], default: "" },
    callDurationSeconds: { type: Number, default: 0 },
    isForwarded: { type: Boolean, default: false, index: true },
    forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    originalMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null, index: true },
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    seen: { type: Boolean, default: false },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
