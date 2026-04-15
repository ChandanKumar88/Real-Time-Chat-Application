const User = require("../models/User");
const { setUserSocket, removeUserSocket, getOnlineUserIds } = require("./presenceStore");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("user:online", async (userId) => {
      if (!userId) return;
      setUserSocket(userId, socket.id);
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      io.emit("presence:update", getOnlineUserIds());
      socket.data.userId = userId;
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (!userId) return;
      removeUserSocket(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit("presence:update", getOnlineUserIds());
    });
  });
}

module.exports = { registerSocketHandlers };
