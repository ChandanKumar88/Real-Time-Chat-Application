const userSocketMap = new Map();

function setUserSocket(userId, socketId) {
  userSocketMap.set(userId, socketId);
}

function removeUserSocket(userId) {
  userSocketMap.delete(userId);
}

function getSocketIdByUserId(userId) {
  return userSocketMap.get(userId);
}

function getOnlineUserIds() {
  return Array.from(userSocketMap.keys());
}

module.exports = { setUserSocket, removeUserSocket, getSocketIdByUserId, getOnlineUserIds };
