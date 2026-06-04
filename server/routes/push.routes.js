const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getPublicKey, saveSubscription, removeSubscription } = require("../controllers/push.controller");

const router = express.Router();

router.get("/public-key", getPublicKey);
router.use(protect);
router.post("/subscriptions", saveSubscription);
router.delete("/subscriptions", removeSubscription);

module.exports = router;
