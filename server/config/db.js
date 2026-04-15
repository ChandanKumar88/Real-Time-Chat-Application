const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/realtime_chat_app";
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI is missing in .env, using local fallback mongodb://127.0.0.1:27017/realtime_chat_app");
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected");
}

module.exports = connectDB;
