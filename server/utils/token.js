const jwt = require("jsonwebtoken");

function generateToken(user, sessionId) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, fullName: user.fullName, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

module.exports = { generateToken };
