const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getConversation, sendMessage, markSeen, deleteMessage } = require("../controllers/message.controller");

const router = express.Router();
router.use(protect);

router.get("/:userId", getConversation);
router.post("/:userId", sendMessage);
router.patch("/:messageId/seen", markSeen);
router.delete("/:messageId", deleteMessage);

module.exports = router;
