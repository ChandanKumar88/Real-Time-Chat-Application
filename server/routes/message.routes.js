const express = require("express");
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const {
  getConversation,
  getUploadSignature,
  sendMessage,
  markSeen,
  deleteMessage,
  clearConversation,
  deleteConversation,
  uploadMedia,
} = require("../controllers/message.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max limit
});

const router = express.Router();
router.use(protect);

router.post("/upload-media", upload.single("file"), uploadMedia);
router.patch("/conversation/:userId/clear", clearConversation);
router.delete("/conversation/:userId", deleteConversation);
router.get("/upload/signature", getUploadSignature);
router.get("/:userId", getConversation);
router.post("/:userId", sendMessage);
router.patch("/:messageId/seen", markSeen);
router.delete("/:messageId", deleteMessage);

module.exports = router;
