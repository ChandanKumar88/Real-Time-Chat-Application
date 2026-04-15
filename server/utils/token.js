const jwt = require("jsonwebtoken");

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, fullName: user.fullName },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

module.exports = { generateToken };
