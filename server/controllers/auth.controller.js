const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateToken } = require("../utils/token");
const { cloudinary } = require("../config/cloudinary");
const { verifyGoogleIdToken } = require("../utils/googleAuth");

function serializeUser(user) {
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    bio: user.bio,
    profilePic: user.profilePic,
    isOnline: user.isOnline,
    authProvider: user.authProvider,
  };
}

async function signup(req, res) {
  const { fullName, email, password, bio, profilePic } = req.body;
  const normalizedEmail = email?.toLowerCase();
  if (!fullName || !email || !password) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 chars" });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ success: false, message: "Email already in use" });
  }

  const hashed = await bcrypt.hash(password, 10);
  let uploadedProfilePic = "";

  if (profilePic) {
    const uploadResult = await cloudinary.uploader.upload(profilePic, {
      folder: "chat-app/profiles",
    });
    uploadedProfilePic = uploadResult.secure_url;
  }

  const user = await User.create({
    fullName,
    email: normalizedEmail,
    password: hashed,
    bio: bio || "",
    profilePic: uploadedProfilePic,
  });

  return res.status(201).json({
    success: true,
    message: "Signup successful",
    data: {
      token: generateToken(user),
      user: serializeUser(user),
    },
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }
  if (!user.password) {
    return res.status(401).json({ success: false, message: "Please continue with Google for this account" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  const token = generateToken(user);
  return res.json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: serializeUser(user),
    },
  });
}

async function googleLogin(req, res) {
  try {
    const payload = await verifyGoogleIdToken(req.body.credential);
    const email = payload.email.toLowerCase();

    let user = await User.findOne({
      $or: [{ googleId: payload.sub }, { email }],
    });

    if (user) {
      let shouldSave = false;
      if (!user.googleId) {
        user.googleId = payload.sub;
        shouldSave = true;
      }
      if (user.authProvider !== "google") {
        user.authProvider = user.password ? "local" : "google";
        shouldSave = true;
      }
      if (!user.profilePic && payload.picture) {
        user.profilePic = payload.picture;
        shouldSave = true;
      }
      if (shouldSave) await user.save();
    } else {
      user = await User.create({
        fullName: payload.name || email.split("@")[0],
        email,
        googleId: payload.sub,
        authProvider: "google",
        profilePic: payload.picture || "",
      });
    }

    return res.json({
      success: true,
      message: "Google login successful",
      data: {
        token: generateToken(user),
        user: serializeUser(user),
      },
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || "Google authentication failed",
    });
  }
}

async function me(req, res) {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  return res.json({ success: true, data: user });
}

module.exports = { signup, login, googleLogin, me };
