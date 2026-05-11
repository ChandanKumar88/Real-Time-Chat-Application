const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const PendingSignup = require("../models/PendingSignup");
const PasswordResetOtp = require("../models/PasswordResetOtp");
const { generateToken } = require("../utils/token");
const { cloudinary } = require("../config/cloudinary");
const { verifyGoogleIdToken } = require("../utils/googleAuth");
const { sendPasswordResetOtpEmail, sendSignupOtpEmail } = require("../utils/email");

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function serializeUser(user) {
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    bio: user.bio,
    profilePic: user.profilePic,
    publicKey: user.publicKey,
    encryptionKeyBackup: user.encryptionKeyBackup,
    isOnline: user.isOnline,
    authProvider: user.authProvider,
  };
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function createSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(24).toString("hex");
}

async function startSession(user) {
  const sessionId = createSessionId();
  user.activeSessionId = sessionId;
  user.activeSessionStartedAt = new Date();
  await user.save();
  return sessionId;
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
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await sendSignupOtpEmail({ to: normalizedEmail, otp });
  await PendingSignup.findOneAndUpdate(
    { email: normalizedEmail },
    {
      fullName,
      email: normalizedEmail,
      password: hashed,
      bio: bio || "",
      profilePic: profilePic || "",
      otpHash,
      attempts: 0,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.status(200).json({
    success: true,
    message: "OTP sent to your email",
    data: {
      email: normalizedEmail,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    },
  });
}

async function verifySignupOtp(req, res) {
  const { email, otp } = req.body;
  const normalizedEmail = email?.toLowerCase();

  if (!normalizedEmail || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required" });
  }
  if (!/^\d{6}$/.test(String(otp))) {
    return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
  }

  const pendingSignup = await PendingSignup.findOne({ email: normalizedEmail });
  if (!pendingSignup) {
    return res.status(404).json({ success: false, message: "OTP expired or signup request not found" });
  }
  if (pendingSignup.expiresAt < new Date()) {
    await PendingSignup.deleteOne({ _id: pendingSignup._id });
    return res.status(410).json({ success: false, message: "OTP expired. Please sign up again" });
  }
  if (pendingSignup.attempts >= OTP_MAX_ATTEMPTS) {
    await PendingSignup.deleteOne({ _id: pendingSignup._id });
    return res.status(429).json({ success: false, message: "Too many incorrect attempts. Please sign up again" });
  }

  const isOtpValid = await bcrypt.compare(String(otp), pendingSignup.otpHash);
  if (!isOtpValid) {
    pendingSignup.attempts += 1;
    await pendingSignup.save();
    return res.status(401).json({ success: false, message: "Invalid OTP" });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    await PendingSignup.deleteOne({ _id: pendingSignup._id });
    return res.status(409).json({ success: false, message: "Email already in use" });
  }

  let uploadedProfilePic = "";

  if (pendingSignup.profilePic) {
    const uploadResult = await cloudinary.uploader.upload(pendingSignup.profilePic, {
      folder: "chat-app/profiles",
    });
    uploadedProfilePic = uploadResult.secure_url;
  }

  const user = await User.create({
    fullName: pendingSignup.fullName,
    email: normalizedEmail,
    password: pendingSignup.password,
    bio: pendingSignup.bio || "",
    profilePic: uploadedProfilePic,
  });
  const sessionId = await startSession(user);
  await PendingSignup.deleteOne({ _id: pendingSignup._id });

  return res.status(201).json({
    success: true,
    message: "Signup verified successfully",
    data: {
      token: generateToken(user, sessionId),
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

  const sessionId = await startSession(user);
  const token = generateToken(user, sessionId);
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

    const sessionId = await startSession(user);
    return res.json({
      success: true,
      message: "Google login successful",
      data: {
        token: generateToken(user, sessionId),
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

async function logout(req, res) {
  await User.updateOne(
    { _id: req.user.id, activeSessionId: req.user.sessionId },
    {
      $set: { isOnline: false, lastSeen: new Date() },
      $unset: { activeSessionId: "", activeSessionStartedAt: "" },
    }
  );

  return res.json({ success: true, message: "Logged out successfully" });
}

async function requestPasswordReset(req, res) {
  const normalizedEmail = req.body.email?.toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(404).json({ success: false, message: "Account not found" });
  }
  if (!user.password) {
    return res.status(400).json({ success: false, message: "This account uses Google sign-in" });
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await sendPasswordResetOtpEmail({ to: normalizedEmail, otp });
  await PasswordResetOtp.findOneAndUpdate(
    { email: normalizedEmail },
    {
      email: normalizedEmail,
      otpHash,
      attempts: 0,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.json({
    success: true,
    message: "Password reset OTP sent",
    data: { email: normalizedEmail, expiresInMinutes: OTP_EXPIRY_MINUTES },
  });
}

async function resetPassword(req, res) {
  const normalizedEmail = req.body.email?.toLowerCase();
  const { otp, password } = req.body;

  if (!normalizedEmail || !otp || !password) {
    return res.status(400).json({ success: false, message: "Email, OTP and new password are required" });
  }
  if (!/^\d{6}$/.test(String(otp))) {
    return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 chars" });
  }

  const resetOtp = await PasswordResetOtp.findOne({ email: normalizedEmail });
  if (!resetOtp) {
    return res.status(404).json({ success: false, message: "OTP expired or reset request not found" });
  }
  if (resetOtp.expiresAt < new Date()) {
    await PasswordResetOtp.deleteOne({ _id: resetOtp._id });
    return res.status(410).json({ success: false, message: "OTP expired. Please try again" });
  }
  if (resetOtp.attempts >= OTP_MAX_ATTEMPTS) {
    await PasswordResetOtp.deleteOne({ _id: resetOtp._id });
    return res.status(429).json({ success: false, message: "Too many incorrect attempts. Please try again" });
  }

  const isOtpValid = await bcrypt.compare(String(otp), resetOtp.otpHash);
  if (!isOtpValid) {
    resetOtp.attempts += 1;
    await resetOtp.save();
    return res.status(401).json({ success: false, message: "Invalid OTP" });
  }

  const hashed = await bcrypt.hash(password, 10);
  await User.updateOne(
    { email: normalizedEmail },
    {
      $set: { password: hashed, authProvider: "local", isOnline: false, lastSeen: new Date() },
      $unset: {
        activeSessionId: "",
        activeSessionStartedAt: "",
        encryptionKeyBackup: "",
      },
    }
  );
  await PasswordResetOtp.deleteOne({ _id: resetOtp._id });

  return res.json({ success: true, message: "Password reset successfully" });
}

async function me(req, res) {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  return res.json({ success: true, data: user });
}

module.exports = { signup, verifySignupOtp, login, googleLogin, logout, requestPasswordReset, resetPassword, me };
