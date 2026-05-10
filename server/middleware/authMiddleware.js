const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function protect(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sessionId) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again" });
    }

    const user = await User.findById(payload.id).select("activeSessionId");
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (user.activeSessionId !== payload.sessionId) {
      return res.status(401).json({ success: false, message: "You are logged out because this account has another active session" });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

module.exports = { protect };
