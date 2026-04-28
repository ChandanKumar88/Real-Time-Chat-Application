const mongoose = require("mongoose");

const typingStatusSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isTyping: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

typingStatusSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

module.exports = mongoose.model("TypingStatus", typingStatusSchema);
