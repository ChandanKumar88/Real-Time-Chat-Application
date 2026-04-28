const userSocketMap = new Map();

function setUserSocket(userId, socketId) {
  const normalizedUserId = userId.toString();
  const sockets = userSocketMap.get(normalizedUserId) || new Set();
  sockets.add(socketId);
  userSocketMap.set(normalizedUserId, sockets);
}

function removeUserSocket(userId, socketId) {
  const normalizedUserId = userId.toString();
  const sockets = userSocketMap.get(normalizedUserId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSocketMap.delete(normalizedUserId);
    return false;
  }

  return true;
}

function getSocketIdByUserId(userId) {
  return getSocketIdsByUserId(userId)[0];
}

function getSocketIdsByUserId(userId) {
  return Array.from(userSocketMap.get(userId.toString()) || []);
}

function getOnlineUserIds() {
  return Array.from(userSocketMap.keys());
}

function isUserOnline(userId) {
  return userSocketMap.has(userId.toString());
}

module.exports = { setUserSocket, removeUserSocket, getSocketIdByUserId, getSocketIdsByUserId, getOnlineUserIds, isUserOnline };
