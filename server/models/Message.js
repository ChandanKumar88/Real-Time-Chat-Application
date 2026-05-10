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
    seen: { type: Boolean, default: false },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
