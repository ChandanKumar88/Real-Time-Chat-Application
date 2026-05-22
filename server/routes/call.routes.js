const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  inviteCall,
  acceptCall,
  sendIceCandidate,
  rejectCall,
  endCall,
  logCallMessage,
  listCallEvents,
} = require("../controllers/call.controller");

const router = express.Router();

router.use(protect);
router.get("/events", listCallEvents);
router.post("/invite", inviteCall);
router.post("/accept", acceptCall);
router.post("/ice", sendIceCandidate);
router.post("/reject", rejectCall);
router.post("/end", endCall);
router.post("/log", logCallMessage);

module.exports = router;
