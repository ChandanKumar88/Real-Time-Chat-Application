const User = require("../models/User");
const { setUserSocket, removeUserSocket, getOnlineUserIds } = require("./presenceStore");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    async function markOnline(userId) {
      if (!userId) return;
      setUserSocket(userId, socket.id);
      socket.data.userId = userId;
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      io.emit("presence:update", getOnlineUserIds());
    }

    socket.on("user:online", async (userId) => {
      await markOnline(userId);
    });

    socket.on("presence:ping", async (userId) => {
      await markOnline(userId || socket.data.userId);
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      const stillOnline = removeUserSocket(userId, socket.id);
      if (!stillOnline) {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      }
      io.emit("presence:update", getOnlineUserIds());
    });
  });
}

module.exports = { registerSocketHandlers };
