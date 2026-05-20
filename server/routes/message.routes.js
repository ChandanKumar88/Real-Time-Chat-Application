const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getConversation,
  getUploadSignature,
  sendMessage,
  markSeen,
  deleteMessage,
  clearConversation,
  deleteConversation,
} = require("../controllers/message.controller");

const router = express.Router();
router.use(protect);

router.patch("/conversation/:userId/clear", clearConversation);
router.delete("/conversation/:userId", deleteConversation);
router.get("/upload/signature", getUploadSignature);
router.get("/:userId", getConversation);
router.post("/:userId", sendMessage);
router.patch("/:messageId/seen", markSeen);
router.delete("/:messageId", deleteMessage);

module.exports = router;
