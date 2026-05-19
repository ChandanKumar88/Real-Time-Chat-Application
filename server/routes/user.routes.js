const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  listUsers,
  searchUsers,
  markPresenceOnline,
  updateEncryptionKey,
  updateTypingStatus,
  getTypingStatus,
  updateProfile,
  deleteAccount,
  updateBlockedUser,
} = require("../controllers/user.controller");

const router = express.Router();

router.use(protect);
router.get("/", listUsers);
router.get("/search", searchUsers);
router.patch("/presence/online", markPresenceOnline);
router.patch("/encryption-key", updateEncryptionKey);
router.patch("/typing", updateTypingStatus);
router.get("/typing/:userId", getTypingStatus);
router.patch("/:userId/block", updateBlockedUser);
router.put("/profile", updateProfile);
router.delete("/profile", deleteAccount);

module.exports = router;
