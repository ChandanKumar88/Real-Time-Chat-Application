const User = require("../models/User");
const { setUserSocket, removeUserSocket, getSocketIdsByUserId, getOnlineUserIds } = require("./presenceStore");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    function emitToUser(userId, eventName, payload) {
      if (!userId) return false;
      const socketIds = getSocketIdsByUserId(userId);
      socketIds.forEach((socketId) => io.to(socketId).emit(eventName, payload));
      return socketIds.length > 0;
    }

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

    socket.on("typing:start", ({ senderId, receiverId }) => {
      if (!senderId || !receiverId) return;
      const receiverSocketIds = getSocketIdsByUserId(receiverId);
      if (receiverSocketIds.length > 0) {
        io.to(receiverSocketIds).emit("typing:update", { userId: senderId, isTyping: true });
      }
    });

    socket.on("typing:stop", ({ senderId, receiverId }) => {
      if (!senderId || !receiverId) return;
      const receiverSocketIds = getSocketIdsByUserId(receiverId);
      if (receiverSocketIds.length > 0) {
        io.to(receiverSocketIds).emit("typing:update", { userId: senderId, isTyping: false });
      }
    });

    socket.on("call:invite", ({ to, offer, caller }) => {
      const from = socket.data.userId || caller?._id;
      if (!from || !to || !offer) return;

      const delivered = emitToUser(to, "call:incoming", {
        from,
        caller,
        offer,
      });

      if (!delivered) {
        socket.emit("call:unavailable", { to });
      }
    });

    socket.on("call:accept", ({ to, answer }) => {
      const from = socket.data.userId;
      if (!from || !to || !answer) return;
      emitToUser(to, "call:accepted", { from, answer });
    });

    socket.on("call:ice", ({ to, candidate }) => {
      const from = socket.data.userId;
      if (!from || !to || !candidate) return;
      emitToUser(to, "call:ice", { from, candidate });
    });

    socket.on("call:reject", ({ to, reason }) => {
      const from = socket.data.userId;
      if (!from || !to) return;
      emitToUser(to, "call:rejected", { from, reason: reason || "rejected" });
    });

    socket.on("call:end", ({ to }) => {
      const from = socket.data.userId;
      if (!from || !to) return;
      emitToUser(to, "call:ended", { from });
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
