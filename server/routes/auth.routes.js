const express = require("express");
const { signup, verifySignupOtp, login, googleLogin, logout, me } = require("../controllers/auth.controller");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/signup/verify", verifySignupOtp);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/logout", protect, logout);
router.get("/me", protect, me);

module.exports = router;
