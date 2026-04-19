const http = require("http");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const connectDB = require("./config/db.js");
const { connectCloudinary } = require("./config/cloudinary.js");
const authRoutes = require("./routes/auth.routes.js");
const userRoutes = require("./routes/user.routes.js");
const messageRoutes = require("./routes/message.routes.js");
const { registerSocketHandlers } = require("./socket/socketHandlers.js");

dotenv.config();

const app = express();
const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL?.split(",") || ["http://localhost:5173"],
    credentials: true,
  },
});

app.set("io", io);

app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(",") || ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

registerSocketHandlers(io);


async function start() {
  try {
    await connectDB();
    connectCloudinary();
    if (process.env.NODE_ENV !== "production") {
      const PORT = process.env.PORT || 5000;
      server.listen(PORT, () => console.log("Server running on PORT: " + PORT));
    }
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

start();

module.exports = app;

// Export server for Vercel
export default server;
