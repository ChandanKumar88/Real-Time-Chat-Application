import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiLock,
  FiMenu,
  FiMic,
  FiMicOff,
  FiMinimize2,
  FiMinus,
  FiMoreHorizontal,
  FiPhone,
  FiPhoneOff,
  FiPlus,
  FiRotateCcw,
  FiSearch,
  FiShare2,
  FiUserPlus,
  FiVideo,
  FiVolume2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { api } from "../services/api";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import bgImage from "../assets/bgImage.svg";

const CALL_EVENT_POLL_INTERVAL_MS = 900;

function getCallIceServers() {
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turnUrls = import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL;
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrls && username && credential) {
    iceServers.push({
      urls: turnUrls.split(",").map((url) => url.trim()).filter(Boolean),
      username,
      credential,
    });
  }

  return iceServers;
}

export default function HomePage() {
  const { user, logout, setupEncryptionPassphrase } = useAuth();
  const {
    users,
    loadUsers,
    selectedUser,
    setSelectedUser,
    loadMessages,
    messages,
    sendMessage,
    markSeen,
    deleteMessage,
    typingUsers,
    emitTyping,
    stopTyping,
  } = useChat();
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [video, setVideo] = useState("");
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("chat_theme") || "light");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const [isSharedMediaOpen, setIsSharedMediaOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewVideoRatio, setPreviewVideoRatio] = useState(null);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [callState, setCallState] = useState({
    status: "idle",
    direction: "",
    peer: null,
    muted: false,
    startedAt: null,
  });
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callHistory, setCallHistory] = useState([]);
  const [isCallHistoryLoaded, setIsCallHistoryLoaded] = useState(false);
  const [, setCallClockTick] = useState(0);
  const pinchStateRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const callPeerIdRef = useRef("");
  const queuedIceCandidatesRef = useRef([]);
  const callStateRef = useRef(callState);
  const usersRef = useRef(users);
  const callIdRef = useRef("");
  const lastCallEventAtRef = useRef(new Date(Date.now() - 60_000).toISOString());
  const processedCallEventsRef = useRef(new Set());
  const pendingLocalIceCandidatesRef = useRef([]);
  const activeCallHistoryIdRef = useRef("");

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, [user?.encryptionPassphraseRequired]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (callState.status === "idle") return;
    const intervalId = window.setInterval(() => setCallClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [callState.status]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    if (!user?._id) return;

    setIsCallHistoryLoaded(false);
    try {
      const savedHistory = localStorage.getItem(`quickchat_call_history_${user._id}`);
      setCallHistory(savedHistory ? JSON.parse(savedHistory) : []);
    } catch {
      setCallHistory([]);
    } finally {
      setIsCallHistoryLoaded(true);
    }
  }, [user?._id]);

  useEffect(() => {
    if (!user?._id || !isCallHistoryLoaded) return;
    localStorage.setItem(`quickchat_call_history_${user._id}`, JSON.stringify(callHistory.slice(0, 30)));
  }, [callHistory, isCallHistoryLoaded, user?._id]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("chat_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    if (!selectedUser) return;
    setReplyToMessage(null);
    loadMessages(selectedUser._id).catch((error) => {
      toast.error(error?.response?.data?.message || "Failed to load messages");
    });
    return () => stopTyping(selectedUser._id);
  }, [selectedUser, user?.encryptionPassphraseRequired]);

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    if (!selectedUser) return;
    messages.forEach((m) => {
      if (m.receiverId === user._id && !m.seen) markSeen(m._id).catch(() => null);
    });
  }, [messages, selectedUser, user?._id, user?.encryptionPassphraseRequired]);

  useEffect(() => {
    setPreviewZoom(1);
    setPreviewVideoRatio(null);
    pinchStateRef.current = null;
  }, [previewMedia]);

  const filteredUsers = useMemo(() => users, [users]);
  const isSelectedUserTyping = Boolean(selectedUser && typingUsers[selectedUser._id]);
  const isCallOpen = callState.status !== "idle";
  const shouldShowFullCallScreen = isCallOpen && !isCallMinimized;
  const previewableMedia = useMemo(
    () =>
      messages
        .filter((m) => m.image || m.video)
        .map((m) => ({
          id: m._id,
          type: m.image ? "image" : "video",
          src: m.image || m.video,
        })),
    [messages]
  );
  const messageSearchResults = useMemo(() => {
    const keyword = messageSearch.trim().toLowerCase();
    if (!keyword) return [];

    return messages
      .filter((message) => message.text && message.text.toLowerCase().includes(keyword))
      .map((message) => ({
        _id: message._id,
        text: message.text,
        senderId: message.senderId,
        createdAt: message.createdAt,
      }));
  }, [messages, messageSearch]);
  const activeSearchMessageId = messageSearchResults[activeSearchIndex]?._id || "";

  useEffect(() => {
    setIsSearchOpen(false);
    setIsSharedMediaOpen(false);
    setMessageSearch("");
    setActiveSearchIndex(0);
  }, [selectedUser?._id]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [messageSearch]);

  useEffect(() => {
    if (activeSearchIndex >= messageSearchResults.length) {
      setActiveSearchIndex(Math.max(0, messageSearchResults.length - 1));
    }
  }, [activeSearchIndex, messageSearchResults.length]);

  function clampZoom(value) {
    return Math.min(4, Math.max(1, Number(value.toFixed(2))));
  }

  function getTouchDistance(touches) {
    const [first, second] = touches;
    if (!first || !second) return 0;
    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.hypot(dx, dy);
  }

  async function handleDownloadPreview() {
    if (!previewMedia?.src) return;
    try {
      const response = await fetch(previewMedia.src);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const extension = previewMedia.type === "image" ? "jpg" : "mp4";
      link.href = blobUrl;
      link.download = `quickchat-media.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(previewMedia.src, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSharePreview() {
    if (!previewMedia?.src) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "QuickChat Media",
          url: previewMedia.src,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(previewMedia.src);
        toast.success("Media link copied");
        return;
      }
    } catch {
      // Fall through to final fallback.
    }

    window.open(previewMedia.src, "_blank", "noopener,noreferrer");
  }

  function openPreview(media) {
    const matchedMedia =
      previewableMedia.find((item) => (media.id ? item.id === media.id : item.src === media.src && item.type === media.type)) || media;
    setPreviewMedia(matchedMedia);
    setPreviewZoom(1);
  }

  function stepPreview(direction) {
    if (!previewMedia || previewableMedia.length <= 1) return;
    const currentIndex = previewableMedia.findIndex((item) => item.id === previewMedia.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + previewableMedia.length) % previewableMedia.length;
    setPreviewMedia(previewableMedia[nextIndex]);
  }

  function getSendErrorMessage(error, payload) {
    const status = error?.response?.status;
    const serverMessage = error?.response?.data?.message;

    if (status === 413) {
      return "Video bahut bada hai. Vercel server 4.5MB se bada upload accept nahi karta.";
    }

    if (payload?.video && !serverMessage) {
      return "Video upload fail hua. Vercel deploy par video ko chhota rakho, warna body size limit hit hoti hai.";
    }

    return serverMessage || error?.message || "Failed to send media";
  }

  function formatCallDuration(startedAt) {
    if (!startedAt) return "0:00";
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getCallStatusText() {
    if (callState.status === "ringing") return "Incoming audio call";
    if (callState.status === "calling") return "Calling...";
    if (callState.status === "connecting") return "Connecting...";
    if (callState.status === "active") {
      return callState.startedAt ? `In call - ${formatCallDuration(callState.startedAt)}` : "In call";
    }
    return "Audio call";
  }

  function getCallInitials(name) {
    return (name || "QC")
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function formatPanelTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function rememberCall(peer, status, type = "audio") {
    if (!peer?._id) return;
    const labels = {
      missed: "Missed",
      received: "Received",
      outgoing: "Outgoing",
    };
    const historyId = callIdRef.current || `${Date.now()}-${peer._id}-${status}`;
    const entry = {
      id: historyId,
      userId: peer._id,
      name: peer.fullName || "QuickChat user",
      profilePic: peer.profilePic || "",
      type,
      status,
      statusLabel: labels[status] || "Call",
      time: formatPanelTime(Date.now()),
    };
    activeCallHistoryIdRef.current = historyId;
    setCallHistory((prev) => [entry, ...prev.filter((item) => item.id !== historyId)].slice(0, 30));
  }

  function completeCurrentCallHistory(fallbackStatus = "outgoing") {
    const peer = callStateRef.current.peer;
    if (!peer?._id) return;

    if (!activeCallHistoryIdRef.current) {
      rememberCall(peer, fallbackStatus);
      return;
    }

    setCallHistory((prev) =>
      prev.map((item) =>
        item.id === activeCallHistoryIdRef.current
          ? {
              ...item,
              time: item.time || formatPanelTime(Date.now()),
            }
          : item
      )
    );
  }

  function handleStartVideoCall() {
    toast("Video call UI ready hai, video calling logic abhi add nahi hua.");
  }

  const isPortraitPreviewVideo = previewMedia?.type === "video" && previewVideoRatio && previewVideoRatio < 1;

  async function unlockEncryptedChats(event) {
    event.preventDefault();
    if (recoveryBusy) return;

    try {
      setRecoveryBusy(true);
      const updatedUser = await setupEncryptionPassphrase(recoveryPassphrase);
      if (updatedUser.encryptionRecoveryRequired || updatedUser.encryptionPassphraseRequired) {
        toast.error("Original device par pehle chat recovery passphrase set karo.");
        return;
      }

      setRecoveryPassphrase("");
      toast.success("Encrypted chats unlocked");
      await loadUsers();
    } catch (error) {
      toast.error(error.message || "Unable to unlock encrypted chats");
    } finally {
      setRecoveryBusy(false);
    }
  }

  function getCallPeer(userId, fallback = {}) {
    return (
      usersRef.current.find((item) => item._id === userId) ||
      (selectedUser?._id === userId ? selectedUser : null) ||
      fallback || {
        _id: userId,
        fullName: "QuickChat user",
        profilePic: "",
      }
    );
  }

  function getCallerSnapshot() {
    return {
      _id: user._id,
      fullName: user.fullName,
      profilePic: user.profilePic || "",
    };
  }

  function stopCallMedia() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
  }

  function resetCall() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingOfferRef.current = null;
    callPeerIdRef.current = "";
    callIdRef.current = "";
    queuedIceCandidatesRef.current = [];
    pendingLocalIceCandidatesRef.current = [];
    activeCallHistoryIdRef.current = "";
    stopCallMedia();
    setIsCallMinimized(false);
    setCallState({ status: "idle", direction: "", peer: null, muted: false, startedAt: null });
  }

  async function sendCallSignal(type, to, payload = {}) {
    if (!to) return null;

    const { data } = await api.post(`/calls/${type}`, {
      to,
      callId: callIdRef.current,
      ...payload,
    });

    if (data.data?.callId) {
      callIdRef.current = data.data.callId;
    }

    return data.data;
  }

  function normalizeIceCandidate(candidate) {
    if (!candidate) return null;
    return typeof candidate.toJSON === "function" ? candidate.toJSON() : candidate;
  }

  async function flushLocalIceCandidates(peerId) {
    if (!peerId || !callIdRef.current || pendingLocalIceCandidatesRef.current.length === 0) return;

    const candidates = pendingLocalIceCandidatesRef.current;
    pendingLocalIceCandidatesRef.current = [];
    await Promise.all(candidates.map((candidate) => sendCallSignal("ice", peerId, { candidate }).catch(() => null)));
  }

  function notifyCallEnd() {
    const peerId = callPeerIdRef.current;
    if (!peerId) return;
    sendCallSignal("end", peerId).catch(() => null);
  }

  async function flushQueuedIceCandidates() {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection?.remoteDescription) return;

    const queuedCandidates = queuedIceCandidatesRef.current;
    queuedIceCandidatesRef.current = [];
    await Promise.all(
      queuedCandidates.map((candidate) => peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => null))
    );
  }

  function attachRemoteAudioStream(remoteStream) {
    if (!remoteStream || !remoteAudioRef.current) return;

    remoteStreamRef.current = remoteStream;
    remoteAudioRef.current.autoplay = true;
    remoteAudioRef.current.playsInline = true;
    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.muted = false;
    remoteAudioRef.current.volume = 1;
    remoteAudioRef.current.play().catch(() => {
      toast.error("Audio blocked hai. Call screen par ek baar tap karke audio allow karo.");
    });
  }

  async function addLocalAudioTracks(peerConnection) {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !callStateRef.current.muted;
        if (!peerConnection.getSenders().some((sender) => sender.track?.id === track.id)) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });
      return;
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    localStreamRef.current = localStream;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("Microphone audio track nahi mila. Mic permission check karo.");
    }

    audioTracks.forEach((track) => {
      track.enabled = !callStateRef.current.muted;
      peerConnection.addTrack(track, localStream);
    });
  }

  function waitForIceGatheringComplete(peerConnection) {
    if (peerConnection.iceGatheringState === "complete") return Promise.resolve();

    return new Promise((resolve) => {
      let resolved = false;

      function finish() {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timeoutId);
        peerConnection.removeEventListener("icegatheringstatechange", handleIceGatheringChange);
        resolve();
      }

      const timeoutId = window.setTimeout(finish, 3000);

      function handleIceGatheringChange() {
        if (peerConnection.iceGatheringState !== "complete") return;
        finish();
      }

      peerConnection.addEventListener("icegatheringstatechange", handleIceGatheringChange);
    });
  }

  async function createPeerConnection(peerId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser microphone calling support nahi kar raha.");
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: getCallIceServers(),
      iceCandidatePoolSize: 4,
    });
    peerConnectionRef.current = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = normalizeIceCandidate(event.candidate);
        if (!candidate) return;
        if (!callIdRef.current) {
          pendingLocalIceCandidatesRef.current.push(candidate);
          return;
        }
        sendCallSignal("ice", peerId, { candidate }).catch(() => null);
      }
    };

    peerConnection.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams?.[0] && event.track && !remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      attachRemoteAudioStream(remoteStream);
    };

    peerConnection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peerConnection.connectionState)) {
        if (callStateRef.current.status !== "idle") {
          resetCall();
        }
      }
    };

    return peerConnection;
  }

  async function startAudioCall() {
    if (!selectedUser) return;
    if (!selectedUser.isOnline) {
      toast.error("User offline hai, audio call abhi start nahi ho sakti.");
      return;
    }
    if (callStateRef.current.status !== "idle") {
      toast.error("Ek call already active hai.");
      return;
    }

    try {
      callPeerIdRef.current = selectedUser._id;
      callIdRef.current = "";
      queuedIceCandidatesRef.current = [];
      setIsCallMinimized(false);
      setCallState({ status: "calling", direction: "outgoing", peer: selectedUser, muted: false, startedAt: null });
      rememberCall(selectedUser, "outgoing");

      const peerConnection = await createPeerConnection(selectedUser._id);
      await addLocalAudioTracks(peerConnection);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      await sendCallSignal("invite", selectedUser._id, { caller: getCallerSnapshot(), offer: peerConnection.localDescription });
      await flushLocalIceCandidates(selectedUser._id);
    } catch (error) {
      resetCall();
      toast.error(error?.message || "Audio call start nahi ho pa rahi.");
    }
  }

  async function acceptAudioCall() {
    const peerId = callPeerIdRef.current;
    const offer = pendingOfferRef.current;
    if (!peerId || !offer) return;

    try {
      setCallState((prev) => ({ ...prev, status: "connecting" }));
      const peerConnection = await createPeerConnection(peerId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      await addLocalAudioTracks(peerConnection);
      await flushQueuedIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await waitForIceGatheringComplete(peerConnection);
      await sendCallSignal("accept", peerId, { answer: peerConnection.localDescription });
      await flushLocalIceCandidates(peerId);

      setCallState((prev) => ({ ...prev, status: "active", startedAt: prev.startedAt || Date.now() }));
      rememberCall(callStateRef.current.peer, "received");
      pendingOfferRef.current = null;
    } catch (error) {
      sendCallSignal("reject", peerId, { reason: "failed" }).catch(() => null);
      resetCall();
      toast.error(error?.message || "Call accept nahi ho pa rahi.");
    }
  }

  function rejectAudioCall() {
    const peerId = callPeerIdRef.current;
    if (callStateRef.current.direction === "incoming") {
      rememberCall(callStateRef.current.peer, "missed");
    }
    if (peerId) sendCallSignal("reject", peerId, { reason: "rejected" }).catch(() => null);
    resetCall();
  }

  function endAudioCall() {
    completeCurrentCallHistory(callStateRef.current.direction === "incoming" ? "received" : "outgoing");
    notifyCallEnd();
    resetCall();
  }

  function toggleCallMute() {
    const nextMuted = !callStateRef.current.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setCallState((prev) => ({ ...prev, muted: nextMuted }));
  }

  async function handleCallEvent(event) {
    if (!event?._id || processedCallEventsRef.current.has(event._id)) return;
    processedCallEventsRef.current.add(event._id);

    const from = event.from?.toString?.() || event.from;
    const payload = event.payload || {};

    if (event.type === "invite") {
      if (!from || !payload.offer) return;

      if (callStateRef.current.status !== "idle") {
        await api.post("/calls/reject", { to: from, callId: event.callId, reason: "busy" }).catch(() => null);
        return;
      }

      callPeerIdRef.current = from;
      callIdRef.current = event.callId;
      pendingOfferRef.current = payload.offer;
      queuedIceCandidatesRef.current = [];
      setIsCallMinimized(false);
      setCallState({
        status: "ringing",
        direction: "incoming",
        peer: getCallPeer(from, payload.caller),
        muted: false,
        startedAt: null,
      });
      return;
    }

    if (event.callId !== callIdRef.current || from !== callPeerIdRef.current) return;

    if (event.type === "accept") {
      if (!payload.answer || !peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        await flushQueuedIceCandidates();
        setCallState((prev) => ({ ...prev, status: "active", startedAt: prev.startedAt || Date.now() }));
      } catch {
        resetCall();
        toast.error("Call connect nahi ho paayi.");
      }
      return;
    }

    if (event.type === "ice") {
      if (!payload.candidate) return;
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection?.remoteDescription) {
        queuedIceCandidatesRef.current.push(payload.candidate);
        return;
      }
      await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => null);
      return;
    }

    if (event.type === "reject") {
      const message = payload.reason === "busy" ? "User dusri call mein busy hai." : "Audio call reject ho gayi.";
      completeCurrentCallHistory("outgoing");
      resetCall();
      toast.error(message);
      return;
    }

    if (event.type === "end" && callStateRef.current.status !== "idle") {
      if (callStateRef.current.status === "ringing" && callStateRef.current.direction === "incoming") {
        rememberCall(callStateRef.current.peer, "missed");
      } else {
        completeCurrentCallHistory(callStateRef.current.direction === "incoming" ? "received" : "outgoing");
      }
      resetCall();
      toast("Audio call ended");
    }
  }

  useEffect(() => {
    if (!user || user.encryptionPassphraseRequired) return;

    let stopped = false;
    let polling = false;

    async function pollCallEvents() {
      if (polling || stopped) return;
      polling = true;
      try {
        const { data } = await api.get("/calls/events", {
          params: { since: lastCallEventAtRef.current },
        });
        for (const event of data.data || []) {
          if (stopped) break;
          await handleCallEvent(event);
        }
        if (data.nextSince) lastCallEventAtRef.current = data.nextSince;
      } catch {
        // Polling retries on the next tick.
      } finally {
        polling = false;
      }
    }

    pollCallEvents();
    const intervalId = window.setInterval(pollCallEvents, CALL_EVENT_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [user?._id, user?.encryptionPassphraseRequired]);

  useEffect(
    () => () => {
      notifyCallEnd();
      resetCall();
    },
    []
  );

  useEffect(() => {
    if (!previewMedia) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPreviewMedia(null);
      }
      if (event.key === "ArrowLeft") {
        stepPreview(-1);
      }
      if (event.key === "ArrowRight") {
        stepPreview(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMedia, previewableMedia]);

  if (user?.encryptionPassphraseRequired) {
    return (
      <div className={`grid min-h-[100dvh] place-items-center px-4 ${theme === "dark" ? "bg-black text-white" : "bg-slate-100 text-slate-900"}`}>
        <form
          onSubmit={unlockEncryptedChats}
          className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
            theme === "dark" ? "border-white/15 bg-[#101014]" : "border-slate-200 bg-white"
          }`}
        >
          <h1 className="text-2xl font-semibold">Unlock encrypted chats</h1>
          <p className={`mt-3 text-sm leading-6 ${theme === "dark" ? "text-slate-300" : "text-slate-600"}`}>
            Previous messages dekhne ke liye apna chat recovery passphrase enter karo. Agar ye Google account ka first device hai, original
            Chrome window par pehle passphrase set karo.
          </p>
          <input
            className={`mt-5 w-full rounded-xl border px-3 py-3 outline-none transition focus:border-violet-400 ${
              theme === "dark"
                ? "border-white/20 bg-transparent text-white placeholder:text-slate-500"
                : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
            }`}
            type="password"
            placeholder="Chat recovery passphrase"
            value={recoveryPassphrase}
            onChange={(event) => setRecoveryPassphrase(event.target.value)}
          />
          <button
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={recoveryBusy || recoveryPassphrase.length < 8}
          >
            {recoveryBusy ? "Unlocking..." : "Unlock chats"}
          </button>
          <button
            type="button"
            className={`mt-4 text-sm font-semibold ${theme === "dark" ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}
            onClick={logout}
          >
            Use another account
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`min-h-[100dvh] p-0 md:grid md:min-h-screen md:place-items-center md:p-3 ${theme === "dark" ? "bg-black" : "bg-slate-100"}`}>
      <div
        className={`relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden p-2 md:h-[calc(100vh-24px)] md:rounded-2xl md:border md:p-2 lg:h-[92vh] lg:p-4 ${
          theme === "dark" ? "bg-[#15151c] md:border-white/25" : "bg-white md:border-slate-300"
        }`}
        style={{
          backgroundImage:
            theme === "dark"
              ? `linear-gradient(rgba(12,12,16,0.6), rgba(12,12,16,0.7)), url(${bgImage})`
              : `linear-gradient(rgba(255,255,255,0.72), rgba(255,255,255,0.72)), url(${bgImage})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
      <div className="mb-2 flex shrink-0 items-center justify-between px-2 pt-2 lg:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm shadow ${
            theme === "dark" ? "border border-white/20 bg-white/10 text-slate-200" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          <FiMenu />
          Menu
        </button>
        <p className={`text-sm font-semibold ${theme === "dark" ? "text-slate-200" : "text-slate-700"}`}>Quick Chat</p>
      </div>

      {isSidebarOpen && (
        <button
          aria-label="Close sidebar backdrop"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
        />
      )}

      {isMediaOpen && (
        <button
          aria-label="Close media backdrop"
          onClick={() => setIsMediaOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/55 lg:hidden"
        />
      )}

      {previewMedia && (
        <button
          aria-label="Close media preview"
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 bg-black/85"
        />
      )}

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {shouldShowFullCallScreen && (
        <div className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col overflow-hidden bg-[#111b21] text-white">
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                `linear-gradient(rgba(17,27,33,0.88), rgba(17,27,33,0.92)), url(${bgImage})`,
              backgroundSize: "cover, 430px",
            }}
          />
          <div className="absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/55 to-transparent" />
          <div className="relative z-20 flex min-h-[100dvh] flex-col px-5 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCallMinimized(true)}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white shadow-xl shadow-black/20 backdrop-blur transition hover:bg-white/15 sm:h-12 sm:w-12"
                aria-label="Minimize call"
              >
                <FiMinimize2 className="text-2xl sm:text-xl" />
              </button>
              <button
                type="button"
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white shadow-xl shadow-black/20 backdrop-blur transition hover:bg-white/15 sm:h-12 sm:w-12"
                aria-label="Add person"
                title="Add person"
              >
                <FiUserPlus className="text-2xl sm:text-xl" />
              </button>
            </div>

            <div className="mt-2 text-center sm:mt-0">
              <h2 className="mx-auto max-w-[78vw] truncate text-2xl font-semibold text-white sm:text-3xl">
                {callState.peer?.fullName || "QuickChat user"}
              </h2>
              <p className="mt-1 inline-flex items-center gap-2 text-sm text-white/60">
                <FiLock className="text-xs" />
                End-to-end encrypted
              </p>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="relative flex h-52 w-52 items-center justify-center sm:h-64 sm:w-64">
                <span className="quickchat-call-ripple quickchat-call-ripple-1" />
                <span className="quickchat-call-ripple quickchat-call-ripple-2" />
                <span className="quickchat-call-ripple quickchat-call-ripple-3" />
                {callState.peer?.profilePic ? (
                  <img
                    src={callState.peer.profilePic}
                    alt={callState.peer?.fullName || "Caller"}
                    className="relative z-10 h-36 w-36 rounded-full border border-white/15 object-cover shadow-2xl shadow-black/50 sm:h-44 sm:w-44"
                  />
                ) : (
                  <span className="relative z-10 grid h-36 w-36 place-items-center rounded-full border border-white/15 bg-[#eeedfe] text-4xl font-semibold text-[#3c3489] shadow-2xl shadow-black/50 sm:h-44 sm:w-44 sm:text-5xl">
                    {getCallInitials(callState.peer?.fullName)}
                  </span>
                )}
              </div>
              {callState.status === "active" ? (
                <>
                  <p className="mt-6 text-2xl font-semibold tabular-nums text-emerald-400 sm:text-3xl">
                    {formatCallDuration(callState.startedAt)}
                  </p>
                  <div className="quickchat-call-wave mt-5" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </>
              ) : (
                <p className="mt-6 text-lg font-medium text-white/65">{getCallStatusText()}</p>
              )}
            </div>

            <div className="mx-auto w-full max-w-[680px] rounded-[34px] border border-white/10 bg-black/40 px-4 py-4 shadow-2xl shadow-black/35 backdrop-blur-2xl sm:px-6 sm:py-5">
              {callState.status === "ringing" ? (
                <div className="flex items-center justify-center gap-10">
                  <button
                    type="button"
                    onClick={rejectAudioCall}
                    className="flex flex-col items-center gap-2 text-xs font-semibold text-white/75"
                  >
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-600">
                      <FiPhoneOff className="text-2xl" />
                    </span>
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={acceptAudioCall}
                    className="flex flex-col items-center gap-2 text-xs font-semibold text-white/75"
                  >
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-600">
                      <FiPhone className="text-2xl" />
                    </span>
                    Accept
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-5 items-center gap-2">
                  <button type="button" className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15 sm:h-14 sm:w-14">
                      <FiMoreHorizontal className="text-xl" />
                    </span>
                    More
                  </button>
                  <button type="button" className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white/75 transition hover:bg-white/15 sm:h-14 sm:w-14">
                      <FiVideo className="text-xl" />
                    </span>
                    Video
                  </button>
                  <button type="button" className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15 sm:h-14 sm:w-14">
                      <FiVolume2 className="text-xl" />
                    </span>
                    Speaker
                  </button>
                  <button
                    type="button"
                    onClick={toggleCallMute}
                    disabled={callState.status !== "active"}
                    className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-full transition sm:h-14 sm:w-14 ${
                        callState.muted ? "bg-white text-[#111b21]" : "bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      {callState.muted ? <FiMicOff className="text-xl" /> : <FiMic className="text-xl" />}
                    </span>
                    {callState.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={endAudioCall}
                    className="flex flex-col items-center gap-2 text-[11px] font-medium text-rose-200"
                  >
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-600 sm:h-16 sm:w-16">
                      <FiPhoneOff className="text-2xl" />
                    </span>
                    End
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 px-2 pb-2 lg:grid-cols-12 lg:gap-3 lg:px-0 lg:pb-0">
      <div className="hidden lg:col-span-4 lg:block lg:h-full xl:col-span-3">
        <Sidebar
          users={filteredUsers}
          search={search}
          setSearch={setSearch}
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          onLogout={logout}
          theme={theme}
          toggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          callHistory={callHistory}
        />
      </div>

      {isSidebarOpen && (
        <Sidebar
          users={filteredUsers}
          search={search}
          setSearch={setSearch}
          selectedUser={selectedUser}
          setSelectedUser={(u) => {
            setSelectedUser(u);
            setIsSidebarOpen(false);
          }}
          onLogout={logout}
          theme={theme}
          toggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          callHistory={callHistory}
          isMobileOpen
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`flex min-h-0 h-full flex-col lg:col-span-8 ${isSearchOpen || isSharedMediaOpen ? "xl:col-span-6" : "xl:col-span-9"}`}>
        {isCallOpen && isCallMinimized && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsCallMinimized(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsCallMinimized(false);
              }
            }}
            className="mb-2 flex h-16 shrink-0 items-center justify-between rounded-2xl border border-emerald-400/10 bg-[#0b1115] px-3 text-left text-white shadow-2xl"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10">
                {callState.muted ? <FiMicOff className="text-xl text-white/85" /> : <FiPhone className="text-xl text-emerald-400" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-emerald-400">
                  {callState.peer?.fullName || "QuickChat user"}
                  {callState.status === "active" ? ` - ${formatCallDuration(callState.startedAt)}` : ""}
                </span>
                <span className="block truncate text-sm text-white/60">
                  {callState.status === "active" ? "Tap to return to call" : getCallStatusText()}
                </span>
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                endAudioCall();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  endAudioCall();
                }
              }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-950/30"
              aria-label="End call"
            >
              <FiPhoneOff />
            </span>
          </div>
        )}
        <ChatContainer
          user={user}
          selectedUser={selectedUser}
          messages={messages}
          text={text}
          setText={setText}
          onTextChange={(value) => {
            setText(value);
            if (selectedUser && value.trim()) {
              emitTyping(selectedUser._id);
            } else if (selectedUser) {
              stopTyping(selectedUser._id);
            }
          }}
          setImage={setImage}
          setVideo={setVideo}
          image={image}
          video={video}
          replyToMessage={replyToMessage}
          isTyping={isSelectedUserTyping}
          theme={theme}
          onOpenMedia={() => setIsMediaOpen(true)}
          onOpenSharedMedia={() => {
            setIsSearchOpen(false);
            setIsSharedMediaOpen(true);
          }}
          onStartAudioCall={startAudioCall}
          onStartVideoCall={handleStartVideoCall}
          isCallDisabled={callState.status !== "idle" || !selectedUser?.isOnline}
          onOpenSearchPanel={() => {
            setIsSharedMediaOpen(false);
            setIsSearchOpen(true);
          }}
          searchKeyword={messageSearch}
          activeSearchMessageId={activeSearchMessageId}
          onPreviewMedia={openPreview}
          onReplyMessage={setReplyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          onDeleteMessage={async (messageId) => {
            const confirmed = window.confirm("Delete this message?");
            if (!confirmed) return;
            try {
              await deleteMessage(messageId);
            } catch (error) {
              toast.error(error?.response?.data?.message || "Failed to delete message");
            }
          }}
          onSend={async (e) => {
            e.preventDefault();
            if (!selectedUser || (!text.trim() && !image && !video)) return;
            const payload = { text: text.trim(), image, video, replyTo: replyToMessage?._id || null };
            setText("");
            setImage("");
            setVideo("");
            setReplyToMessage(null);
            stopTyping(selectedUser._id);
            try {
              await sendMessage(selectedUser._id, payload);
            } catch (error) {
              setText(payload.text);
              setImage(payload.image);
              setVideo(payload.video);
              setReplyToMessage(replyToMessage);
              toast.error(getSendErrorMessage(error, payload));
            }
          }}
        />
      </div>

      {isSearchOpen && selectedUser ? (
        <aside
          className={`hidden h-full overflow-hidden rounded-3xl p-4 shadow-2xl backdrop-blur transition lg:fixed lg:bottom-3 lg:right-3 lg:top-3 lg:z-40 lg:block lg:w-[360px] lg:max-w-[calc(100vw-420px)] xl:static xl:col-span-3 xl:w-auto xl:max-w-none ${
            theme === "dark" ? "border border-white/20 bg-[#11131a]/96" : "border border-slate-300 bg-white/95"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className={`text-base font-semibold ${theme === "dark" ? "text-slate-100" : "text-slate-900"}`}>Search messages</h3>
              <p className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>Only in current chat</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className={`rounded-full p-2 ${theme === "dark" ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
              aria-label="Close search"
            >
              <FiX />
            </button>
          </div>
          <div className="relative mb-4">
            <FiSearch className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`} />
            <input
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              placeholder="Search in this chat..."
              className={`w-full rounded-full py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 ${
                theme === "dark"
                  ? "border border-white/10 bg-[#2a2553]/75 text-slate-200 placeholder:text-slate-400"
                  : "border border-slate-300 bg-white/90 text-slate-800 placeholder:text-slate-500"
              }`}
            />
          </div>
          <div className={`mb-3 flex items-center justify-between text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            <span>{messageSearch.trim() ? `${messageSearchResults.length} result${messageSearchResults.length === 1 ? "" : "s"}` : "Type a keyword"}</span>
            {messageSearchResults.length > 0 && (
              <span>
                {activeSearchIndex + 1}/{messageSearchResults.length}
              </span>
            )}
          </div>
          <div className="chat-scroll max-h-[calc(100%-132px)] space-y-2 overflow-y-auto pr-1">
            {messageSearchResults.map((result, index) => {
              const isActive = index === activeSearchIndex;
              return (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => setActiveSearchIndex(index)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    isActive
                      ? theme === "dark"
                        ? "border-amber-300/60 bg-amber-300/10"
                        : "border-amber-300 bg-amber-50"
                      : theme === "dark"
                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-white/80 hover:bg-slate-100"
                  }`}
                >
                  <p className={`mb-1 text-[11px] ${result.senderId === user?._id ? "text-violet-300" : theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                    {result.senderId === user?._id ? "You" : selectedUser.fullName} - {formatPanelTime(result.createdAt)}
                  </p>
                  <p className={`line-clamp-2 text-sm ${theme === "dark" ? "text-slate-100" : "text-slate-800"}`}>{result.text}</p>
                </button>
              );
            })}
            {messageSearch.trim() && messageSearchResults.length === 0 && (
              <p className={`rounded-2xl px-3 py-8 text-center text-sm ${theme === "dark" ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                No matching message found.
              </p>
            )}
          </div>
        </aside>
      ) : null}

      {isSharedMediaOpen && selectedUser ? (
        <div className="hidden h-full transition lg:fixed lg:bottom-3 lg:right-3 lg:top-3 lg:z-40 lg:block lg:w-[360px] lg:max-w-[calc(100vw-420px)] xl:static xl:col-span-3 xl:w-auto xl:max-w-none">
          <RightSidebar
            selectedUser={selectedUser}
            messages={messages}
            currentUserId={user?._id}
            onPreviewMedia={openPreview}
            onDeleteMessage={async (messageId) => {
              const confirmed = window.confirm("Delete this media?");
              if (!confirmed) return;
              try {
                await deleteMessage(messageId);
              } catch (error) {
                toast.error(error?.response?.data?.message || "Failed to delete media");
              }
            }}
            theme={theme}
            onCloseMobile={() => setIsSharedMediaOpen(false)}
          />
        </div>
      ) : null}

      {isMediaOpen && selectedUser ? (
        <RightSidebar
          selectedUser={selectedUser}
          messages={messages}
          currentUserId={user?._id}
          onPreviewMedia={openPreview}
          onDeleteMessage={async (messageId) => {
            const confirmed = window.confirm("Delete this media?");
            if (!confirmed) return;
            try {
              await deleteMessage(messageId);
            } catch (error) {
              toast.error(error?.response?.data?.message || "Failed to delete media");
            }
          }}
          theme={theme}
          mobile
          onCloseMobile={() => setIsMediaOpen(false)}
        />
      ) : null}

      {previewMedia ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {previewableMedia.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => stepPreview(-1)}
                className="absolute left-4 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                aria-label="Previous media"
              >
                <FiChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => stepPreview(1)}
                className="absolute right-4 top-1/2 z-[61] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                aria-label="Next media"
              >
                <FiChevronRight />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setPreviewMedia(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            aria-label="Close preview"
          >
            <FiX />
          </button>
          {previewMedia.type === "image" ? (
            <>
              <div className="absolute bottom-4 left-1/2 z-[61] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-white backdrop-blur">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => clampZoom(prev - 0.25))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Zoom out"
                >
                  <FiMinus />
                </button>
                <span className="min-w-12 text-center text-sm font-medium">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => clampZoom(prev + 0.25))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Zoom in"
                >
                  <FiPlus />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Reset zoom"
                >
                  <FiRotateCcw />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Download media"
                >
                  <FiDownload />
                </button>
                <button
                  type="button"
                  onClick={handleSharePreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Share media"
                >
                  <FiShare2 />
                </button>
                {previewableMedia.length > 1 && (
                  <span className="min-w-14 text-center text-sm font-medium">
                    {previewableMedia.findIndex((item) => item.id === previewMedia.id) + 1}/{previewableMedia.length}
                  </span>
                )}
              </div>
              <div
                className="relative flex max-h-full max-w-full items-center justify-center overflow-auto rounded-2xl"
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.2 : -0.2;
                  setPreviewZoom((prev) => clampZoom(prev + delta));
                }}
                onTouchStart={(e) => {
                  if (e.touches.length !== 2) return;
                  pinchStateRef.current = {
                    distance: getTouchDistance(e.touches),
                    zoom: previewZoom,
                  };
                }}
                onTouchMove={(e) => {
                  if (e.touches.length !== 2 || !pinchStateRef.current) return;
                  const nextDistance = getTouchDistance(e.touches);
                  const baseDistance = pinchStateRef.current.distance || nextDistance;
                  const scaleRatio = nextDistance / baseDistance;
                  setPreviewZoom(clampZoom(pinchStateRef.current.zoom * scaleRatio));
                }}
                onTouchEnd={() => {
                  pinchStateRef.current = null;
                }}
              >
                {previewableMedia.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => stepPreview(-1)}
                      className="absolute left-0 top-0 z-[62] h-full w-1/5 cursor-w-resize bg-transparent"
                      aria-label="Previous media area"
                    />
                    <button
                      type="button"
                      onClick={() => stepPreview(1)}
                      className="absolute right-0 top-0 z-[62] h-full w-1/5 cursor-e-resize bg-transparent"
                      aria-label="Next media area"
                    />
                  </>
                )}
                <img
                  src={previewMedia.src}
                  alt="Shared media preview"
                  className={`max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-transform duration-150 ${
                    previewZoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewZoom((prev) => (prev > 1 ? 1 : 2));
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setPreviewZoom((prev) => clampZoom(prev >= 2 ? prev + 0.5 : 2));
                  }}
                  style={{ transform: `scale(${previewZoom})`, transformOrigin: "center center" }}
                />
              </div>
            </>
          ) : (
            <div className="relative flex max-h-[88vh] max-w-[min(92vw,1100px)] flex-col items-center justify-center gap-4">
              <div
                className={`flex max-h-[78vh] max-w-full items-center justify-center overflow-hidden bg-black/80 shadow-2xl backdrop-blur-sm ${
                  isPortraitPreviewVideo
                    ? "rounded-[32px] border border-white/10 px-3 py-4 sm:px-4 sm:py-5"
                    : "rounded-[28px] p-2 sm:p-3"
                }`}
              >
                <video
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={(event) => {
                    const { videoWidth, videoHeight } = event.currentTarget;
                    if (!videoWidth || !videoHeight) return;
                    setPreviewVideoRatio(videoWidth / videoHeight);
                  }}
                  className={`block bg-black object-contain ${
                    isPortraitPreviewVideo
                      ? "max-h-[70vh] w-auto max-w-[82vw] rounded-[26px] sm:max-w-[min(52vw,420px)] lg:max-w-[min(36vw,360px)]"
                      : "max-h-[72vh] max-w-[min(88vw,920px)] rounded-[22px]"
                  }`}
                >
                  <source src={previewMedia.src} />
                </video>
              </div>
              <div className="z-[61] flex flex-wrap items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-white backdrop-blur">
                <button
                  type="button"
                  onClick={handleDownloadPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Download media"
                >
                  <FiDownload />
                </button>
                <button
                  type="button"
                  onClick={handleSharePreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Share media"
                >
                  <FiShare2 />
                </button>
                {previewableMedia.length > 1 && (
                  <span className="min-w-14 text-center text-sm font-medium">
                    {previewableMedia.findIndex((item) => item.id === previewMedia.id) + 1}/{previewableMedia.length}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}
