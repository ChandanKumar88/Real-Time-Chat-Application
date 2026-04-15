const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listUsers, searchUsers, updateProfile, deleteAccount } = require("../controllers/user.controller");

const router = express.Router();

router.use(protect);
router.get("/", listUsers);
router.get("/search", searchUsers);
router.put("/profile", updateProfile);
router.delete("/profile", deleteAccount);

module.exports = router;
