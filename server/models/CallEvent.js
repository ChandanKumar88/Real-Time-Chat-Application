const mongoose = require("mongoose");

const callEventSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["invite", "accept", "ice", "reject", "end"],
      required: true,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CallEvent", callEventSchema);
