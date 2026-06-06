import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiLock,
  FiLogOut,
  FiMenu,
  FiMessageCircle,
  FiMic,
  FiMicOff,
  FiMinimize2,
  FiMinus,
  FiPhone,
  FiPhoneOff,
  FiPlus,
  FiRotateCcw,
  FiSearch,
  FiShare2,
  FiUser,
  FiVideo,
  FiVideoOff,
  FiVolume2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { api, isManualLogoutInProgress } from "../services/api";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import ProfileAvatar from "../components/ProfileAvatar";
import bgImage from "../assets/bgImage.svg";
import { processImageFile } from "../utils/image";
import { createCallMediaE2ee } from "../utils/callMediaE2ee";

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
  const { user, setUser, logout, setupEncryptionPassphrase } = useAuth();
  const {
    users,
    usersLoading,
    usersLoaded,
    loadUsers,
    selectedUser,
    setSelectedUser,
    messages,
    messagesCache,
    messagesPaging,
    messagesLoading,
    loadOlderMessages,
    sendMessage,
    markSeen,
    deleteMessage,
    clearConversation,
    deleteConversation,
    blockUser,
    recordCallMessage,
    socket,
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
  const [activeDesktopTab, setActiveDesktopTab] = useState("chats");
  const [mobileActiveTab, setMobileActiveTab] = useState("chats");
  const [mobileCallSearch, setMobileCallSearch] = useState("");
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [mobileProfileForm, setMobileProfileForm] = useState({ fullName: "", bio: "", profilePic: "", preview: "" });
  const [isMobileProfileSaving, setIsMobileProfileSaving] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [searchJumpKey, setSearchJumpKey] = useState(0);
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
    speakerOn: false,
    cameraOff: false,
    type: "audio",
    startedAt: null,
  });
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callHistory, setCallHistory] = useState([]);
  const [isCallHistoryLoaded, setIsCallHistoryLoaded] = useState(false);
  const [callHasVideo, setCallHasVideo] = useState(false);
  const [, setCallClockTick] = useState(0);
  const pinchStateRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const callMediaE2eeRef = useRef(null);
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
  const protectedCallSendersRef = useRef(new WeakSet());
  const protectedCallReceiversRef = useRef(new WeakSet());
  const activeCallHistoryIdRef = useRef("");
  const speakerSinkIdRef = useRef("");
  const speakerAudioContextRef = useRef(null);
  const speakerSourceRef = useRef(null);
  const speakerGainRef = useRef(null);
  const ringtoneAudioContextRef = useRef(null);
  const ringtoneIntervalRef = useRef(null);
  const ringtoneKindRef = useRef("");
  const ringtoneTimersRef = useRef([]);
  const callTimeoutRef = useRef(null);
  const callNotificationRef = useRef(null);
  const callConnectionFailTimeoutRef = useRef(null);
  const selectedMessagesPaging = selectedUser ? messagesPaging?.[selectedUser._id] || {} : {};
  const isCallOpen = callState.status !== "idle";
  const shouldShowFullCallScreen = isCallOpen && !isCallMinimized;
  const isVideoCall = callState.type === "video" || callHasVideo;
  const isVideoActive = isVideoCall && ["connecting", "active"].includes(callState.status);

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    loadUsers().catch(() => {
      if (!isManualLogoutInProgress()) toast.error("Failed to load users");
    });
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
    function primeCallAudio() {
      getRingtoneAudioContext()?.resume?.().catch(() => null);
      if ("Notification" in window && Notification.permission === "default") {
        const permissionRequest = Notification.requestPermission();
        permissionRequest?.catch?.(() => null);
      }
    }

    window.addEventListener("pointerdown", primeCallAudio, { once: true });
    window.addEventListener("keydown", primeCallAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeCallAudio);
      window.removeEventListener("keydown", primeCallAudio);
    };
  }, []);

  useEffect(() => {
    if (callState.status === "calling") {
      playRingtone("outgoing");
    } else if (callState.status === "ringing") {
      playRingtone("incoming");
      showIncomingCallNotification(callState.peer);
    } else {
      stopRingtone();
    }

    window.clearTimeout(callTimeoutRef.current);
    if (["calling", "ringing"].includes(callState.status)) {
      callTimeoutRef.current = window.setTimeout(() => {
        if (callStateRef.current.status === "calling") {
          completeCurrentCallHistory("outgoing");
          saveCallMessage("outgoing");
          notifyCallEnd();
          toast.error("Call not answered");
          resetCall();
          return;
        }

        if (callStateRef.current.status === "ringing") {
          rememberCall(callStateRef.current.peer, "missed", callStateRef.current.type || "audio");
          saveCallMessage("missed");
          if (callPeerIdRef.current) sendCallSignal("reject", callPeerIdRef.current, { reason: "missed" }).catch(() => null);
          resetCall();
        }
      }, 45_000);
    }

    return () => window.clearTimeout(callTimeoutRef.current);
  }, [callState.status, callState.peer]);

  useEffect(() => {
    if (!socket || !user || user.encryptionPassphraseRequired) return;

    const handleRealtimeCallEvent = (event) => {
      handleCallEvent(event).catch(() => null);
    };

    socket.on("call:event", handleRealtimeCallEvent);
    return () => socket.off("call:event", handleRealtimeCallEvent);
  }, [socket, user?._id, user?.encryptionPassphraseRequired]);

  useEffect(() => {
    if (!shouldShowFullCallScreen || !isVideoCall) return;
    if (localStreamRef.current) attachLocalVideoStream(localStreamRef.current);
    if (remoteStreamRef.current) attachRemoteMediaStream(remoteStreamRef.current);
  }, [shouldShowFullCallScreen, isVideoCall, callState.status, callState.cameraOff]);

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
    setMobileProfileForm({
      fullName: user?.fullName || "",
      bio: user?.bio || "",
      profilePic: "",
      preview: user?.profilePic || "",
    });
  }, [user?.fullName, user?.bio, user?.profilePic]);

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    if (!selectedUser) return;
    setReplyToMessage(null);
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
  const mobileFilteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((item) => {
      const name = item.fullName || "";
      const email = item.email || "";
      return name.toLowerCase().includes(keyword) || email.toLowerCase().includes(keyword);
    });
  }, [search, users]);
  const showInitialUsersLoading = usersLoading && !usersLoaded;
  const showNoMobileUsersFound = usersLoaded && mobileFilteredUsers.length === 0;
  const conversationPreviews = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(messagesCache || {}).map(([peerId, cachedMessages]) => {
          const lastMessage = cachedMessages?.filter((message) => !message.pending).at(-1);
          if (!lastMessage) return [peerId, null];

          let previewText = "Message";
          if (lastMessage.decryptionFailed) previewText = "Message can't be opened";
          else if (lastMessage.callType) previewText = lastMessage.callType === "video" ? "Video call" : "Voice call";
          else if (lastMessage.text) previewText = lastMessage.text;
          else if (lastMessage.image) previewText = "Photo";
          else if (lastMessage.video) previewText = "Video";

          return [
            peerId,
            {
              text: lastMessage.senderId === user?._id ? `You: ${previewText}` : previewText,
              createdAt: lastMessage.createdAt,
            },
          ];
        })
      ),
    [messagesCache, user?._id]
  );
  const mobileFilteredCalls = useMemo(() => {
    const keyword = mobileCallSearch.trim().toLowerCase();
    if (!keyword) return callHistory;
    return callHistory.filter((call) =>
      [call.name, call.statusLabel, call.status, call.type, call.time]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [callHistory, mobileCallSearch]);
  const isSelectedUserTyping = Boolean(selectedUser && typingUsers[selectedUser._id]);

  async function handleForwardMessages({ messages: forwardMessages = [], users: targetUsers = [], note = "" }) {
    const orderedMessages = [...forwardMessages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    for (const targetUser of targetUsers) {
      for (const message of orderedMessages) {
        const payload = {
          text: message.decryptionFailed ? "" : message.text || "",
          image: message.image || "",
          video: message.video || "",
          imageUrl: message.image || "",
          videoUrl: message.video || "",
          isForwarded: true,
          forwardedFrom: message.senderId,
          originalMessageId: message._id,
        };

        if (!payload.text && !payload.image && !payload.video && !payload.imageUrl && !payload.videoUrl) continue;
        await sendMessage(targetUser._id, payload);
      }

      if (note.trim()) {
        await sendMessage(targetUser._id, { text: note.trim() });
      }
    }
  }
  const previewableMedia = useMemo(
    () =>
      messages
        .filter((m) => m.image || m.video)
        .map((m) => ({
          id: m._id,
          type: m.image ? "image" : "video",
          src: m.image || m.video,
          senderId: m.senderId,
          createdAt: m.createdAt,
        })),
    [messages]
  );
  const previewIndex = useMemo(
    () => (previewMedia ? previewableMedia.findIndex((item) => item.id === previewMedia.id) : -1),
    [previewMedia, previewableMedia]
  );
  const previewSender = useMemo(() => {
    if (!previewMedia) return null;
    const isMine = previewMedia.senderId === user?._id;
    return {
      fullName: isMine ? user?.fullName || "You" : selectedUser?.fullName || "QuickChat user",
      profilePic: isMine ? user?.profilePic : selectedUser?.profilePic,
    };
  }, [previewMedia, selectedUser, user]);
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
    setSearchJumpKey((prev) => prev + 1);
  }, [selectedUser?._id]);

  useEffect(() => {
    setActiveSearchIndex(0);
    setSearchJumpKey((prev) => prev + 1);
  }, [messageSearch]);

  function jumpToSearchResult(index) {
    setActiveSearchIndex(index);
    setSearchJumpKey((prev) => prev + 1);
  }

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

  function formatPreviewDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
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
      return "Video payload is too large. Select the video again so it can upload directly first.";
    }

    if ((payload?.video || payload?.videoUrl) && !serverMessage) {
      return "Video send failed. Please try uploading the video again.";
    }

    return serverMessage || error?.message || "Failed to send media";
  }

  async function handleMobileProfileImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await processImageFile(file, {
        cropSquare: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.75,
      });
      setMobileProfileForm((prev) => ({ ...prev, profilePic: compressed, preview: compressed }));
    } catch {
      toast.error("Unable to process image");
    } finally {
      event.target.value = "";
    }
  }

  async function handleMobileProfileSave(event) {
    event.preventDefault();
    if (isMobileProfileSaving) return;

    setIsMobileProfileSaving(true);
    try {
      const { data } = await api.put("/users/profile", {
        fullName: mobileProfileForm.fullName,
        bio: mobileProfileForm.bio,
        profilePic: mobileProfileForm.profilePic,
      });
      setUser(data.data);
      setIsMobileProfileOpen(false);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Update failed");
    } finally {
      setIsMobileProfileSaving(false);
    }
  }

  function formatCallDuration(startedAt) {
    if (!startedAt) return "0:00";
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getCallDurationSeconds(startedAt) {
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }

  function getCallStatusText() {
    const label = callState.type === "video" ? "video" : "audio";
    if (callState.status === "ringing") return `Incoming ${label} call`;
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
      rememberCall(peer, fallbackStatus, callStateRef.current.type || "audio");
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

  function saveCallMessage(status) {
    const peer = callStateRef.current.peer;
    const peerId = peer?._id || callPeerIdRef.current;
    if (!peerId || !callIdRef.current) return;

    const direction = callStateRef.current.direction;
    const callerId = direction === "incoming" ? peerId : user._id;
    const durationSeconds = status === "missed" ? 0 : getCallDurationSeconds(callStateRef.current.startedAt);

    recordCallMessage(peerId, {
      callerId,
      callId: callIdRef.current,
      callType: callStateRef.current.type || "audio",
      callStatus: status,
      callDurationSeconds: durationSeconds,
    }).catch(() => null);
  }

  function handleStartVideoCall() {
    startVideoCall();
  }

  function handleDesktopTabChange(tab) {
    setActiveDesktopTab(tab);
    if (tab === "calls") {
      setIsSearchOpen(false);
      setIsSharedMediaOpen(false);
      setIsMediaOpen(false);
    }
  }

  const isPortraitPreviewVideo = previewMedia?.type === "video" && previewVideoRatio && previewVideoRatio < 1;
  const isDesktopRightPanelOpen = activeDesktopTab === "chats" && (isSearchOpen || isSharedMediaOpen);

  function formatMobileTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getMobileCallStatusClass(status) {
    if (status === "missed") return "text-rose-400";
    if (status === "received") return "text-emerald-500";
    return theme === "dark" ? "text-sky-300" : "text-sky-600";
  }

  function renderMobileChatList() {
    return (
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {showInitialUsersLoading && (
          <div className="mt-5 space-y-4" aria-label="Loading users">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-4 rounded-2xl px-1 py-3">
                <div className={`h-14 w-14 shrink-0 rounded-full ${theme === "dark" ? "bg-white/10" : "bg-slate-200"}`} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className={`h-4 w-2/5 rounded-full ${theme === "dark" ? "bg-white/10" : "bg-slate-200"}`} />
                  <div className={`h-3 w-3/5 rounded-full ${theme === "dark" ? "bg-white/5" : "bg-slate-100"}`} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!showInitialUsersLoading && mobileFilteredUsers.map((item) => {
          const preview = conversationPreviews[item._id];
          const active = selectedUser?._id === item._id;
          return (
            <button
              key={item._id}
              type="button"
              onClick={() => {
                setSelectedUser(item);
                setMobileActiveTab("chats");
                setIsMediaOpen(false);
                setIsSharedMediaOpen(false);
                setIsSearchOpen(false);
              }}
              className={`flex w-full items-center gap-4 rounded-2xl px-1 py-3 text-left transition ${
                active
                  ? theme === "dark"
                    ? "bg-violet-500/15"
                    : "bg-violet-50"
                  : theme === "dark"
                    ? "hover:bg-white/5"
                    : "hover:bg-slate-100"
              }`}
            >
              <div className="relative shrink-0">
                <ProfileAvatar src={item.profilePic} name={item.fullName} className="h-14 w-14 rounded-full object-cover" />
                <span
                  className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 ${
                    theme === "dark" ? "border-[#080d10]" : "border-white"
                  } ${item.isOnline ? "bg-emerald-500" : "bg-slate-400"}`}
                />
              </div>
              <div className="min-w-0 flex-1 border-b border-white/5 pb-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className={`truncate text-base font-semibold ${theme === "dark" ? "text-slate-100" : "text-slate-900"}`}>{item.fullName}</p>
                  {preview?.createdAt && (
                    <span className={`shrink-0 text-xs ${theme === "dark" ? "text-slate-500" : "text-slate-400"}`}>
                      {formatMobileTime(preview.createdAt)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                  <p className={`truncate text-sm ${preview ? (theme === "dark" ? "text-slate-400" : "text-slate-500") : item.isOnline ? "text-emerald-500" : "text-slate-500"}`}>
                    {preview?.text || (item.isOnline ? "Online" : "Offline")}
                  </p>
                  {!!item.unreadCount && (
                    <span className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white shadow-lg shadow-emerald-500/30">
                      {item.unreadCount > 99 ? "99+" : item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {showNoMobileUsersFound && (
          <div className={`mt-8 rounded-2xl px-4 py-8 text-center text-sm ${theme === "dark" ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
            No users found.
          </div>
        )}
      </div>
    );
  }

  function renderMobileCallList() {
    return (
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {mobileFilteredCalls.length ? (
          mobileFilteredCalls.map((call) => (
            <div key={call.id} className="flex items-center gap-4 rounded-2xl px-1 py-3">
              <ProfileAvatar src={call.profilePic} name={call.name} className="h-14 w-14 rounded-full object-cover" />
              <div className="min-w-0 flex-1 border-b border-white/5 pb-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className={`truncate text-base font-semibold ${theme === "dark" ? "text-slate-100" : "text-slate-900"}`}>{call.name}</p>
                  {call.time && <span className={`shrink-0 text-xs ${theme === "dark" ? "text-slate-500" : "text-slate-400"}`}>{call.time}</span>}
                </div>
                <p className={`mt-1 flex items-center gap-1.5 truncate text-sm ${getMobileCallStatusClass(call.status)}`}>
                  {call.type === "video" ? <FiVideo /> : <FiPhone />}
                  {call.statusLabel || "Call"} {call.type === "video" ? "video call" : "voice call"}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className={`mt-8 rounded-2xl px-4 py-8 text-center text-sm ${theme === "dark" ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
            {mobileCallSearch.trim() ? "No matching calls found." : "No call history yet."}
          </div>
        )}
      </div>
    );
  }

  async function unlockEncryptedChats(event) {
    event.preventDefault();
    if (recoveryBusy) return;

    try {
      setRecoveryBusy(true);
      const updatedUser = await setupEncryptionPassphrase(recoveryPassphrase);
      if (updatedUser.encryptionRecoveryRequired || updatedUser.encryptionPassphraseRequired) {
        toast.error("Set the chat recovery passphrase on the original device first.");
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
      publicKey: user.publicKey || "",
    };
  }

  function createLocalCallId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function ensureCallMediaE2ee() {
    if (callMediaE2eeRef.current) return callMediaE2eeRef.current;

    callMediaE2eeRef.current = await createCallMediaE2ee();
    return callMediaE2eeRef.current;
  }

  function protectCallSender(sender) {
    if (!sender || protectedCallSendersRef.current.has(sender)) return;
    callMediaE2eeRef.current?.protectSender(sender);
    protectedCallSendersRef.current.add(sender);
  }

  function protectCallReceiver(receiver) {
    if (!receiver || protectedCallReceiversRef.current.has(receiver)) return;
    callMediaE2eeRef.current?.protectReceiver(receiver);
    protectedCallReceiversRef.current.add(receiver);
  }

  function getRingtoneAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!ringtoneAudioContextRef.current || ringtoneAudioContextRef.current.state === "closed") {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      ringtoneAudioContextRef.current = new AudioContextClass();
    }
    return ringtoneAudioContextRef.current;
  }

  function clearRingtoneTimers() {
    if (ringtoneIntervalRef.current) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    ringtoneTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    ringtoneTimersRef.current = [];
  }

  function stopRingtone() {
    clearRingtoneTimers();
    ringtoneKindRef.current = "";
    callNotificationRef.current?.close?.();
    callNotificationRef.current = null;
  }

  function playRingtone(kind) {
    if (!kind || ringtoneKindRef.current === kind) return;

    stopRingtone();
    const audioContext = getRingtoneAudioContext();
    if (!audioContext) return;
    ringtoneKindRef.current = kind;

    audioContext.resume?.().catch(() => null);

    const pattern =
      kind === "incoming"
        ? [
            [880, 0, 0.18],
            [660, 0.24, 0.18],
            [880, 0.48, 0.18],
            [660, 0.72, 0.18],
          ]
        : [
            [440, 0, 0.22],
            [554, 0.34, 0.22],
            [659, 0.68, 0.22],
          ];
    const loopMs = kind === "incoming" ? 1800 : 2100;

    function playPattern() {
      const context = getRingtoneAudioContext();
      if (!context || context.state === "closed") return;
      const startAt = context.currentTime + 0.02;

      pattern.forEach(([frequency, offset, duration]) => {
        try {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, startAt + offset);
          gain.gain.exponentialRampToValueAtTime(kind === "incoming" ? 0.16 : 0.09, startAt + offset + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt + offset);
          oscillator.stop(startAt + offset + duration + 0.04);
        } catch {
          // Audio can be blocked until the browser receives a user gesture.
        }
      });
    }

    playPattern();
    ringtoneIntervalRef.current = window.setInterval(playPattern, loopMs);
  }

  function showIncomingCallNotification(peer) {
    if (!peer || !("Notification" in window) || !document.hidden) return;

    const title = `${peer.fullName || "QuickChat user"} is calling you`;
    const callTypeLabel = callStateRef.current.type === "video" ? "video" : "voice";
    const options = {
      body: `Incoming ${callTypeLabel} call`,
      icon: peer.profilePic || "/favicon.svg",
      tag: "quickchat-incoming-call",
      renotify: true,
    };

    if (Notification.permission === "granted") {
      callNotificationRef.current?.close?.();
      callNotificationRef.current = new Notification(title, options);
      return;
    }

    if (Notification.permission === "default") {
      const permissionRequest = Notification.requestPermission();
      permissionRequest
        ?.then?.((permission) => {
          if (permission !== "granted" || callStateRef.current.status !== "ringing") return;
          callNotificationRef.current?.close?.();
          callNotificationRef.current = new Notification(title, options);
        })
        ?.catch?.(() => null);
    }
  }

  function stopCallMedia() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    stopSpeakerAudioOutput();

    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
  }

  function resetCall() {
    stopRingtone();
    window.clearTimeout(callTimeoutRef.current);
    window.clearTimeout(callConnectionFailTimeoutRef.current);
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    callMediaE2eeRef.current?.close?.();
    callMediaE2eeRef.current = null;
    pendingOfferRef.current = null;
    callPeerIdRef.current = "";
    callIdRef.current = "";
    queuedIceCandidatesRef.current = [];
    pendingLocalIceCandidatesRef.current = [];
    protectedCallSendersRef.current = new WeakSet();
    protectedCallReceiversRef.current = new WeakSet();
    activeCallHistoryIdRef.current = "";
    stopCallMedia();
    setIsCallMinimized(false);
    setCallHasVideo(false);
    setCallState({ status: "idle", direction: "", peer: null, muted: false, speakerOn: false, cameraOff: false, type: "audio", startedAt: null });
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

  function markCallAsVideo() {
    setCallHasVideo(true);
    if (callStateRef.current.type !== "video") {
      setCallState((prev) => ({ ...prev, type: "video" }));
    }
  }

  function attachRemoteMediaStream(remoteStream) {
    if (!remoteStream || !remoteAudioRef.current) return;

    remoteStreamRef.current = remoteStream;
    if (remoteStream.getVideoTracks().length > 0) {
      markCallAsVideo();
    }
    remoteAudioRef.current.autoplay = true;
    remoteAudioRef.current.playsInline = true;
    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.muted = false;
    remoteAudioRef.current.volume = callStateRef.current.speakerOn ? 1 : 0.75;
    if (callStateRef.current.speakerOn) {
      applySpeakerOutput(true).catch(() => null);
    }
    remoteAudioRef.current.play().catch(() => null);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.autoplay = true;
      remoteVideoRef.current.muted = true;
      remoteVideoRef.current.playsInline = true;
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => null);
    }
  }

  function attachLocalVideoStream(localStream) {
    if (!localStream) return;
    if (localStream.getVideoTracks().length > 0) {
      setCallHasVideo(true);
    }
    if (!localVideoRef.current) return;
    localVideoRef.current.muted = true;
    localVideoRef.current.autoplay = true;
    localVideoRef.current.playsInline = true;
    localVideoRef.current.srcObject = localStream;
    localVideoRef.current.play().catch(() => null);
  }

  function retryCallMediaPlayback() {
    remoteAudioRef.current?.play?.().catch(() => null);
    remoteVideoRef.current?.play?.().catch(() => null);
    localVideoRef.current?.play?.().catch(() => null);
  }

  async function applySpeakerOutput(enabled) {
    const audioElement = remoteAudioRef.current;
    if (!audioElement) return false;

    if (!enabled) {
      stopSpeakerAudioOutput();
      audioElement.muted = false;
      audioElement.play().catch(() => null);
    }

    audioElement.muted = false;
    audioElement.volume = enabled ? 1 : 0.75;

    if (typeof audioElement.setSinkId !== "function" || !navigator.mediaDevices?.enumerateDevices) {
      return enabled ? startSpeakerAudioOutput() : false;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
      if (!audioOutputs.length) return false;

      if (!speakerSinkIdRef.current) {
        const speakerOutput =
          audioOutputs.find((device) => /speaker/i.test(device.label)) ||
          audioOutputs.find((device) => device.deviceId === "default") ||
          audioOutputs[0];
        speakerSinkIdRef.current = speakerOutput.deviceId;
      }

      const normalOutput =
        audioOutputs.find((device) => /communications/i.test(device.label)) ||
        audioOutputs.find((device) => device.deviceId === "default") ||
        audioOutputs[0];

      await audioElement.setSinkId(enabled ? speakerSinkIdRef.current : normalOutput.deviceId);
      return true;
    } catch {
      return enabled ? startSpeakerAudioOutput() : false;
    }
  }

  function stopSpeakerAudioOutput() {
    speakerSourceRef.current?.disconnect();
    speakerGainRef.current?.disconnect();
    speakerAudioContextRef.current?.close?.().catch(() => null);
    speakerSourceRef.current = null;
    speakerGainRef.current = null;
    speakerAudioContextRef.current = null;
  }

  async function startSpeakerAudioOutput() {
    if (!remoteStreamRef.current) return false;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      stopSpeakerAudioOutput();
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(remoteStreamRef.current);
      const gain = audioContext.createGain();
      gain.gain.value = 1.35;
      source.connect(gain);
      gain.connect(audioContext.destination);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = true;
      }

      speakerAudioContextRef.current = audioContext;
      speakerSourceRef.current = source;
      speakerGainRef.current = gain;
      return true;
    } catch {
      stopSpeakerAudioOutput();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
      }
      return false;
    }
  }

  async function addLocalMediaTracks(peerConnection, callType = "audio") {
    if (localStreamRef.current) {
      if (callType === "video" && localStreamRef.current.getVideoTracks().length === 0) {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
        });
        cameraStream.getVideoTracks().forEach((track) => localStreamRef.current.addTrack(track));
      }

      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !callStateRef.current.muted;
        if (!peerConnection.getSenders().some((sender) => sender.track?.id === track.id)) {
          const sender = peerConnection.addTrack(track, localStreamRef.current);
          protectCallSender(sender);
        }
      });
      if (callType === "video") {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = !callStateRef.current.cameraOff;
          if (!peerConnection.getSenders().some((sender) => sender.track?.id === track.id)) {
            const sender = peerConnection.addTrack(track, localStreamRef.current);
            protectCallSender(sender);
          }
        });
        attachLocalVideoStream(localStreamRef.current);
      }
      return;
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        callType === "video"
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            }
          : false,
    });
    localStreamRef.current = localStream;
    attachLocalVideoStream(localStream);

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("Microphone audio track nahi mila. Mic permission check karo.");
    }

    audioTracks.forEach((track) => {
      track.enabled = !callStateRef.current.muted;
      const sender = peerConnection.addTrack(track, localStream);
      protectCallSender(sender);
    });
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !callStateRef.current.cameraOff;
      const sender = peerConnection.addTrack(track, localStream);
      protectCallSender(sender);
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

    await ensureCallMediaE2ee();

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
      protectCallReceiver(event.receiver);
      const remoteStream = event.streams?.[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams?.[0] && event.track && !remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      attachRemoteMediaStream(remoteStream);
    };

    peerConnection.onconnectionstatechange = () => {
      if (["connected", "completed"].includes(peerConnection.connectionState)) {
        window.clearTimeout(callConnectionFailTimeoutRef.current);
        return;
      }

      if (["failed", "closed"].includes(peerConnection.connectionState)) {
        window.clearTimeout(callConnectionFailTimeoutRef.current);
        callConnectionFailTimeoutRef.current = window.setTimeout(() => {
          if (callStateRef.current.status === "idle") return;
          if (!["failed", "closed"].includes(peerConnection.connectionState)) return;
          resetCall();
        }, 3500);
      }
    };

    return peerConnection;
  }

  async function startCall(callType = "audio") {
    if (!selectedUser) return;
    if (callStateRef.current.status !== "idle") {
      toast.error("Ek call already active hai.");
      return;
    }

    try {
      callPeerIdRef.current = selectedUser._id;
      callIdRef.current = createLocalCallId();
      queuedIceCandidatesRef.current = [];
      setIsCallMinimized(false);
      setCallHasVideo(callType === "video");
      setCallState({
        status: "calling",
        direction: "outgoing",
        peer: selectedUser,
        muted: false,
        speakerOn: false,
        cameraOff: false,
        type: callType,
        startedAt: null,
      });
      rememberCall(selectedUser, "outgoing", callType);

      const peerConnection = await createPeerConnection(selectedUser._id);
      await addLocalMediaTracks(peerConnection, callType);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await sendCallSignal("invite", selectedUser._id, { caller: getCallerSnapshot(), callType, offer: peerConnection.localDescription });
      await flushLocalIceCandidates(selectedUser._id);
    } catch (error) {
      resetCall();
      toast.error(error?.message || `${callType === "video" ? "Video" : "Audio"} call start nahi ho pa rahi.`);
    }
  }

  function startAudioCall() {
    startCall("audio");
  }

  function startVideoCall() {
    startCall("video");
  }

  async function acceptAudioCall() {
    const peerId = callPeerIdRef.current;
    const offer = pendingOfferRef.current;
    if (!peerId || !offer) return;

    try {
      setCallState((prev) => ({ ...prev, status: "connecting" }));
      const peerConnection = await createPeerConnection(peerId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      await addLocalMediaTracks(peerConnection, callStateRef.current.type || "audio");
      await flushQueuedIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendCallSignal("accept", peerId, { answer: peerConnection.localDescription });
      await flushLocalIceCandidates(peerId);

      setCallState((prev) => ({ ...prev, status: "active", startedAt: prev.startedAt || Date.now() }));
      rememberCall(callStateRef.current.peer, "received", callStateRef.current.type || "audio");
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
      rememberCall(callStateRef.current.peer, "missed", callStateRef.current.type || "audio");
      saveCallMessage("missed");
    }
    if (peerId) sendCallSignal("reject", peerId, { reason: "rejected" }).catch(() => null);
    resetCall();
  }

  function endAudioCall() {
    const status = callStateRef.current.direction === "incoming" ? "received" : "outgoing";
    completeCurrentCallHistory(status);
    saveCallMessage(status);
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

  function toggleCallCamera() {
    if (callStateRef.current.type !== "video") {
      toast.error("Camera sirf video call mein use hota hai.");
      return;
    }
    const nextCameraOff = !callStateRef.current.cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    if (!nextCameraOff) attachLocalVideoStream(localStreamRef.current);
    setCallState((prev) => ({ ...prev, cameraOff: nextCameraOff }));
  }

  async function toggleCallSpeaker() {
    if (!["connecting", "active"].includes(callStateRef.current.status)) {
      toast.error("Speaker call connect hone ke baad use karo.");
      return;
    }

    const nextSpeakerOn = !callStateRef.current.speakerOn;
    setCallState((prev) => ({ ...prev, speakerOn: nextSpeakerOn }));
    const usedOutputDevice = await applySpeakerOutput(nextSpeakerOn);
    toast.success(
      nextSpeakerOn
        ? usedOutputDevice
          ? "Speaker output enabled"
          : "Speaker mode enabled"
        : "Speaker mode disabled"
    );
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
      setCallHasVideo(payload.callType === "video" || payload.type === "video" || payload.isVideoCall === true);
      setCallState({
        status: "ringing",
        direction: "incoming",
        peer: getCallPeer(from, payload.caller),
        muted: false,
        speakerOn: false,
        cameraOff: false,
        type: payload.callType === "video" || payload.type === "video" || payload.isVideoCall === true ? "video" : "audio",
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
      const callTypeLabel = callStateRef.current.type === "video" ? "Video call" : "Audio call";
      const message = payload.reason === "busy" ? "User dusri call mein busy hai." : `${callTypeLabel} reject ho gayi.`;
      completeCurrentCallHistory("outgoing");
      saveCallMessage("outgoing");
      resetCall();
      toast.error(message);
      return;
    }

    if (event.type === "end" && callStateRef.current.status !== "idle") {
      if (callStateRef.current.status === "ringing" && callStateRef.current.direction === "incoming") {
        rememberCall(callStateRef.current.peer, "missed", callStateRef.current.type || "audio");
        saveCallMessage("missed");
      } else {
        const status = callStateRef.current.direction === "incoming" ? "received" : "outgoing";
        completeCurrentCallHistory(status);
        saveCallMessage(status);
      }
      const endedCallLabel = callStateRef.current.type === "video" ? "Video" : "Audio";
      resetCall();
      toast(`${endedCallLabel} call ended`);
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
            Enter your chat recovery passphrase to view previous messages. If this is your first device, set the passphrase first in the
            original browser.
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
    <div className={`min-h-[100dvh] overflow-hidden p-0 md:grid md:min-h-screen md:place-items-center md:p-3 ${theme === "dark" ? "bg-black" : "bg-slate-100"}`}>
      <div
        className={`relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden p-2 md:h-[calc(100vh-24px)] md:rounded-2xl md:border md:p-2 lg:h-[calc(100vh-24px)] lg:p-4 ${
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
      <div className="mb-2 hidden shrink-0 items-center justify-between px-2 pt-2 md:flex lg:hidden">
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
        <div
          className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col overflow-hidden bg-[#111b21] text-white"
          onPointerDown={retryCallMediaPlayback}
        >
          {isVideoActive && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full bg-[#111b21] object-cover"
            />
          )}
          <div
            className={`absolute inset-0 ${isVideoActive ? "" : "opacity-35"}`}
            style={{
              backgroundImage:
                isVideoActive
                  ? "linear-gradient(rgba(0,0,0,0.16), rgba(0,0,0,0.28))"
                  : `linear-gradient(rgba(17,27,33,0.88), rgba(17,27,33,0.92)), url(${bgImage})`,
              backgroundSize: isVideoActive ? "cover" : "cover, 430px",
            }}
          />
          <div className="absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/55 to-transparent" />
          {isVideoCall && ["calling", "connecting", "active"].includes(callState.status) && (
            <div className="absolute right-4 top-24 z-30 h-36 w-28 overflow-hidden rounded-2xl border border-white/15 bg-black/50 shadow-2xl shadow-black/40 sm:right-8 sm:top-28 sm:h-44 sm:w-36">
              {callState.cameraOff ? (
                <div className="grid h-full w-full place-items-center bg-[#182229] text-xs font-semibold text-white/70">
                  Camera off
                </div>
              ) : (
                <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
              )}
            </div>
          )}
          <div className="relative z-20 flex min-h-[100dvh] flex-col px-5 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsCallMinimized(true)}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white shadow-xl shadow-black/20 backdrop-blur transition hover:bg-white/15 sm:h-12 sm:w-12"
                aria-label="Minimize call"
              >
                <FiMinimize2 className="text-2xl sm:text-xl" />
              </button>
            </div>

            <div className="mt-2 text-center sm:mt-0">
              <h2 className="mx-auto max-w-[78vw] truncate text-2xl font-semibold text-white sm:text-3xl">
                {callState.peer?.fullName || "QuickChat user"}
              </h2>
              {callState.status === "active" ? (
                <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] sm:text-xl">
                  {formatCallDuration(callState.startedAt)}
                </p>
              ) : null}
              <p className="mt-1 inline-flex items-center gap-2 text-sm text-white/60">
                <FiLock className="text-xs" />
                End-to-end encrypted
              </p>
            </div>

            <div className={`flex flex-1 flex-col items-center justify-center text-center ${isVideoActive ? "justify-end pb-28 sm:pb-32" : ""}`}>
              {!isVideoActive && (
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
              )}
              {callState.status === "active" && !isVideoActive ? (
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
              ) : callState.status !== "active" ? (
                <p className="mt-6 text-lg font-medium text-white/65">{getCallStatusText()}</p>
              ) : null}
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
                      {isVideoCall ? <FiVideo className="text-2xl" /> : <FiPhone className="text-2xl" />}
                    </span>
                    Accept
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleCallCamera}
                    disabled={!isVideoCall || !["calling", "connecting", "active"].includes(callState.status)}
                    className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-full transition sm:h-14 sm:w-14 ${
                        callState.cameraOff ? "bg-white text-[#111b21]" : "bg-white/10 text-white/75 hover:bg-white/15"
                      }`}
                    >
                      {callState.cameraOff ? <FiVideoOff className="text-xl" /> : <FiVideo className="text-xl" />}
                    </span>
                    {callState.cameraOff ? "Camera on" : "Camera"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleCallSpeaker}
                    disabled={!["connecting", "active"].includes(callState.status)}
                    className="flex flex-col items-center gap-2 text-[11px] font-medium text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-full transition sm:h-14 sm:w-14 ${
                        callState.speakerOn ? "bg-white text-[#111b21]" : "bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      <FiVolume2 className="text-xl" />
                    </span>
                    {callState.speakerOn ? "Speaker on" : "Speaker"}
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        {mobileActiveTab === "chats" && selectedUser ? (
          <ChatContainer
            user={user}
            selectedUser={selectedUser}
            messages={messages}
            messagesLoading={messagesLoading}
            olderMessagesLoading={Boolean(selectedMessagesPaging.loadingOlder)}
            hasOlderMessages={Boolean(selectedMessagesPaging.hasMore)}
            onLoadOlderMessages={() => (selectedUser ? loadOlderMessages(selectedUser._id) : Promise.resolve([]))}
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
            onBackMobile={() => setSelectedUser(null)}
            onOpenMedia={() => setIsMediaOpen(true)}
            onOpenSharedMedia={() => {
              setIsSearchOpen(false);
              setIsSharedMediaOpen(true);
            }}
            onStartAudioCall={startAudioCall}
            onStartVideoCall={handleStartVideoCall}
            isCallDisabled={callState.status !== "idle" || selectedUser?.isBlocked}
            onOpenSearchPanel={() => {
              setIsSharedMediaOpen(false);
              setIsSearchOpen(true);
            }}
            searchKeyword={messageSearch}
            activeSearchMessageId={activeSearchMessageId}
            searchJumpKey={searchJumpKey}
            onPreviewMedia={openPreview}
            forwardUsers={users}
            onForwardMessages={handleForwardMessages}
            onReplyMessage={setReplyToMessage}
            onCancelReply={() => setReplyToMessage(null)}
            onDeleteMessages={async (messageIds) => {
              if (!messageIds?.length) return;
              const confirmed = window.confirm(`Delete ${messageIds.length} selected message${messageIds.length === 1 ? "" : "s"}?`);
              if (!confirmed) return;
              try {
                await Promise.all(messageIds.map((messageId) => deleteMessage(messageId)));
              } catch (error) {
                toast.error(error?.response?.data?.message || "Failed to delete selected messages");
                throw error;
              }
            }}
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
              const isUploadedVideoUrl = /^https?:\/\//i.test(video);
              const payload = {
                text: text.trim(),
                image,
                video: isUploadedVideoUrl ? "" : video,
                videoUrl: isUploadedVideoUrl ? video : "",
                replyTo: replyToMessage?._id || null,
              };
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
                setVideo(payload.videoUrl || payload.video);
                setReplyToMessage(replyToMessage);
                toast.error(getSendErrorMessage(error, payload));
              }
            }}
          />
        ) : (
          <section className={`flex h-full min-h-0 flex-col overflow-hidden ${theme === "dark" ? "bg-[#071014]/88" : "bg-slate-50/95"}`}>
            <div className="shrink-0 px-6 pb-3 pt-[calc(28px+env(safe-area-inset-top))]">
              <div className="flex items-center justify-between gap-4">
                <h1 className={`text-4xl font-bold tracking-normal ${theme === "dark" ? "text-white" : "text-slate-950"}`}>QuickChat</h1>
                <button
                  type="button"
                  onClick={logout}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition ${
                    theme === "dark"
                      ? "border-white/10 bg-white/10 text-rose-200 shadow-lg shadow-black/20 hover:bg-white/15"
                      : "border-slate-200 bg-white text-rose-600 shadow-sm hover:bg-slate-50"
                  }`}
                  aria-label="Logout"
                  title="Logout"
                >
                  <FiLogOut className="text-xl" />
                </button>
              </div>
              <div className="relative mt-6">
                <FiSearch className={`pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-2xl ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`} />
                <input
                  className={`h-16 w-full rounded-full border-0 py-3 pl-14 pr-5 text-lg outline-none transition focus:ring-2 focus:ring-violet-400/60 ${
                    theme === "dark"
                      ? "bg-white/10 text-slate-100 placeholder:text-slate-400"
                      : "bg-white text-slate-900 shadow-sm placeholder:text-slate-500"
                  }`}
                  placeholder={mobileActiveTab === "chats" ? "Search users..." : "Search name"}
                  value={mobileActiveTab === "chats" ? search : mobileCallSearch}
                  onChange={(event) => {
                    if (mobileActiveTab === "chats") setSearch(event.target.value);
                    else setMobileCallSearch(event.target.value);
                  }}
                />
              </div>
            </div>
            {mobileActiveTab === "chats" ? renderMobileChatList() : renderMobileCallList()}
            <nav
              className={`fixed inset-x-0 bottom-0 z-20 border-t px-8 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 ${
                theme === "dark" ? "border-white/5 bg-[#071014]/95 shadow-[0_-18px_35px_rgba(0,0,0,0.32)]" : "border-slate-200 bg-white/95 shadow-[0_-18px_35px_rgba(15,23,42,0.08)]"
              }`}
            >
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "chats", label: "Chats", icon: FiMessageCircle },
                  { id: "calls", label: "Calls", icon: FiPhone },
                  { id: "profile", label: "Profile", icon: FiUser },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.id === "profile" ? isMobileProfileOpen : mobileActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (tab.id === "profile") {
                          setIsMobileProfileOpen(true);
                          return;
                        }
                        setMobileActiveTab(tab.id);
                        if (tab.id === "calls") setSelectedUser(null);
                      }}
                      className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-sm font-semibold transition ${
                        active
                          ? theme === "dark"
                            ? "text-white"
                            : "text-violet-700"
                          : theme === "dark"
                            ? "text-slate-400"
                            : "text-slate-500"
                      }`}
                    >
                      <span className={`grid h-10 w-14 place-items-center rounded-full ${active ? "bg-violet-500/25" : "bg-transparent"}`}>
                        <Icon className="text-2xl" />
                      </span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          </section>
        )}
      </div>

      <div className="hidden min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden px-2 pb-2 md:grid lg:grid-cols-12 lg:gap-3 lg:px-0 lg:pb-0">
      <div className="hidden min-h-0 lg:col-span-4 lg:block lg:h-full xl:col-span-3">
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
          conversationPreviews={conversationPreviews}
          activeTab={activeDesktopTab}
          onTabChange={handleDesktopTabChange}
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
          conversationPreviews={conversationPreviews}
          isMobileOpen
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`flex min-h-0 h-full flex-col lg:col-span-8 ${isDesktopRightPanelOpen ? "xl:col-span-6" : "xl:col-span-9"}`}>
        <div className={`${activeDesktopTab === "calls" ? "flex lg:hidden" : "flex"} min-h-0 h-full flex-col`}>
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
                {callState.type === "video" ? (
                  callState.cameraOff ? (
                    <FiVideoOff className="text-xl text-white/85" />
                  ) : (
                    <FiVideo className="text-xl text-emerald-400" />
                  )
                ) : callState.muted ? (
                  <FiMicOff className="text-xl text-white/85" />
                ) : (
                  <FiPhone className="text-xl text-emerald-400" />
                )}
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
          messagesLoading={messagesLoading}
          olderMessagesLoading={Boolean(selectedMessagesPaging.loadingOlder)}
          hasOlderMessages={Boolean(selectedMessagesPaging.hasMore)}
          onLoadOlderMessages={() => (selectedUser ? loadOlderMessages(selectedUser._id) : Promise.resolve([]))}
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
          isCallDisabled={callState.status !== "idle" || selectedUser?.isBlocked}
          onOpenSearchPanel={() => {
            setIsSharedMediaOpen(false);
            setIsSearchOpen(true);
          }}
          searchKeyword={messageSearch}
          activeSearchMessageId={activeSearchMessageId}
          searchJumpKey={searchJumpKey}
          onPreviewMedia={openPreview}
          forwardUsers={users}
          onForwardMessages={handleForwardMessages}
          onReplyMessage={setReplyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          onDeleteMessages={async (messageIds) => {
            if (!messageIds?.length) return;
            const confirmed = window.confirm(`Delete ${messageIds.length} selected message${messageIds.length === 1 ? "" : "s"}?`);
            if (!confirmed) return;
            try {
              await Promise.all(messageIds.map((messageId) => deleteMessage(messageId)));
            } catch (error) {
              toast.error(error?.response?.data?.message || "Failed to delete selected messages");
              throw error;
            }
          }}
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
            const isUploadedVideoUrl = /^https?:\/\//i.test(video);
            const payload = {
              text: text.trim(),
              image,
              video: isUploadedVideoUrl ? "" : video,
              videoUrl: isUploadedVideoUrl ? video : "",
              replyTo: replyToMessage?._id || null,
            };
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
              setVideo(payload.videoUrl || payload.video);
              setReplyToMessage(replyToMessage);
              toast.error(getSendErrorMessage(error, payload));
            }
          }}
        />
        </div>
      </div>

      {activeDesktopTab === "chats" && isSearchOpen && selectedUser ? (
        <aside
          className={`hidden h-full min-h-0 flex-col overflow-hidden rounded-3xl p-4 shadow-2xl backdrop-blur transition lg:fixed lg:bottom-3 lg:right-3 lg:top-3 lg:z-40 lg:flex lg:w-[360px] lg:max-w-[calc(100vw-420px)] xl:static xl:col-span-3 xl:w-auto xl:max-w-none ${
            theme === "dark" ? "border border-white/20 bg-[#11131a]/96" : "border border-slate-300 bg-white/95"
          }`}
        >
          <div className="mb-4 flex shrink-0 items-center justify-between">
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
          <div className="relative mb-4 shrink-0">
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
          <div className={`mb-3 flex shrink-0 items-center justify-between text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            <span>{messageSearch.trim() ? `${messageSearchResults.length} result${messageSearchResults.length === 1 ? "" : "s"}` : "Type a keyword"}</span>
            {messageSearchResults.length > 0 && (
              <span>
                {activeSearchIndex + 1}/{messageSearchResults.length}
              </span>
            )}
          </div>
          <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
            {messageSearchResults.map((result, index) => {
              const isActive = index === activeSearchIndex;
              return (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => jumpToSearchResult(index)}
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

      {activeDesktopTab === "chats" && isSharedMediaOpen && selectedUser ? (
        <div className="hidden h-full min-h-0 overflow-hidden transition lg:fixed lg:bottom-3 lg:right-3 lg:top-3 lg:z-40 lg:block lg:w-[360px] lg:max-w-[calc(100vw-420px)] xl:static xl:col-span-3 xl:w-auto xl:max-w-none">
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
            onClearChat={async () => {
              await clearConversation(selectedUser._id);
              toast.success("Chat cleared");
            }}
            onDeleteChat={async () => {
              await deleteConversation(selectedUser._id);
              toast.success("Chat deleted");
            }}
            onBlockUser={async (blocked) => {
              await blockUser(selectedUser._id, blocked);
              toast.success(blocked ? `${selectedUser.fullName} blocked` : `${selectedUser.fullName} unblocked`);
            }}
            theme={theme}
            onCloseMobile={() => setIsSharedMediaOpen(false)}
          />
        </div>
      ) : null}
      </div>

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
          onClearChat={async () => {
            await clearConversation(selectedUser._id);
            toast.success("Chat cleared");
          }}
          onDeleteChat={async () => {
            await deleteConversation(selectedUser._id);
            toast.success("Chat deleted");
          }}
          onBlockUser={async (blocked) => {
            await blockUser(selectedUser._id, blocked);
            toast.success(blocked ? `${selectedUser.fullName} blocked` : `${selectedUser.fullName} unblocked`);
          }}
          theme={theme}
          mobile
          onCloseMobile={() => setIsMediaOpen(false)}
        />
      ) : null}

      {isSearchOpen && selectedUser ? (
        <aside
          className={`fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden p-4 md:hidden ${
            theme === "dark" ? "bg-[#0f1118] text-slate-100" : "bg-white text-slate-900"
          }`}
        >
          <div className="mb-5 flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold">Search messages</h3>
              <p className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>Only in current chat</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                theme === "dark" ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
              }`}
              aria-label="Close search"
            >
              <FiX />
            </button>
          </div>

          <div className="relative mb-4 shrink-0">
            <FiSearch className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`} />
            <input
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              placeholder="Search in this chat..."
              className={`h-14 w-full rounded-2xl py-3 pl-12 pr-4 text-base outline-none transition focus:border-violet-400 ${
                theme === "dark"
                  ? "border border-white/10 bg-[#2a2553]/75 text-slate-200 placeholder:text-slate-400"
                  : "border border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-500"
              }`}
              autoFocus
            />
          </div>

          <div className={`mb-3 flex shrink-0 items-center justify-between text-sm ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            <span>{messageSearch.trim() ? `${messageSearchResults.length} result${messageSearchResults.length === 1 ? "" : "s"}` : "Type a keyword"}</span>
            {messageSearchResults.length > 0 && (
              <span>
                {activeSearchIndex + 1}/{messageSearchResults.length}
              </span>
            )}
          </div>

          <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
            {messageSearchResults.map((result, index) => {
              const isActive = index === activeSearchIndex;
              return (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => {
                    jumpToSearchResult(index);
                    setIsSearchOpen(false);
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    isActive
                      ? theme === "dark"
                        ? "border-amber-300/60 bg-amber-300/10"
                        : "border-amber-300 bg-amber-50"
                      : theme === "dark"
                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-white/80 hover:bg-slate-100"
                  }`}
                >
                  <p className={`mb-1 text-xs ${result.senderId === user?._id ? "text-violet-300" : theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
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

      {isMobileProfileOpen ? (
        <div
          className={`fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-6 md:hidden ${
            theme === "dark" ? "bg-black/95 text-slate-100" : "bg-slate-100/95 text-slate-900"
          }`}
        >
          <form
            onSubmit={handleMobileProfileSave}
            className={`relative flex max-h-[calc(100dvh-48px)] w-full max-w-sm flex-col overflow-hidden rounded-2xl p-4 shadow-2xl ${
              theme === "dark" ? "border border-white/15 bg-black/65" : "border border-slate-300 bg-white"
            }`}
            style={{
              backgroundImage:
                theme === "dark"
                  ? `linear-gradient(rgba(6,8,14,0.88), rgba(6,8,14,0.92)), url(${bgImage})`
                  : `linear-gradient(rgba(255,255,255,0.88), rgba(255,255,255,0.92)), url(${bgImage})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Profile details</h2>
              <button
                type="button"
                onClick={() => setIsMobileProfileOpen(false)}
                className={`grid h-9 w-9 place-items-center rounded-full ${theme === "dark" ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                aria-label="Close profile"
              >
                <FiX />
              </button>
            </div>

            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <label className={`mb-3 flex cursor-pointer items-center gap-2 text-xs font-semibold ${theme === "dark" ? "text-slate-200" : "text-slate-700"}`}>
                <ProfileAvatar
                  src={mobileProfileForm.preview}
                  name={mobileProfileForm.fullName || user?.fullName}
                  className={`h-8 w-8 rounded-full object-cover ${theme === "dark" ? "border border-white/20" : "border border-slate-300"}`}
                />
                <span>Upload profile image</span>
                <input
                  className="hidden"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={handleMobileProfileImageChange}
                />
              </label>

              <input
                className={`mb-2 h-11 w-full rounded-md px-3 text-sm outline-none placeholder:text-slate-400 focus:border-violet-400 ${
                  theme === "dark"
                    ? "border border-white/20 bg-black/35 text-slate-100"
                    : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
                }`}
                value={mobileProfileForm.fullName}
                placeholder="Your name"
                onChange={(event) => setMobileProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />

              <textarea
                className={`mb-3 h-24 w-full resize-none rounded-md px-3 py-2 text-sm outline-none focus:border-violet-400 ${
                  theme === "dark"
                    ? "border border-white/20 bg-black/35 text-slate-100 placeholder:text-slate-400"
                    : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
                }`}
                value={mobileProfileForm.bio}
                placeholder="Write profile bio"
                onChange={(event) => setMobileProfileForm((prev) => ({ ...prev, bio: event.target.value }))}
              />

              <button
                type="submit"
                disabled={isMobileProfileSaving}
                className="mb-5 w-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isMobileProfileSaving ? "Saving..." : "Save"}
              </button>

              <div className="grid place-items-center pb-4">
                <ProfileAvatar
                  src={mobileProfileForm.preview}
                  name={mobileProfileForm.fullName || user?.fullName}
                  className={`h-36 w-36 rounded-full border-4 object-cover shadow-lg shadow-violet-500/20 ${
                    theme === "dark" ? "border-white/20" : "border-violet-200"
                  }`}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm("Are you sure? This will permanently delete your account and chats.");
                if (!confirmed) return;
                try {
                  await api.delete("/users/profile");
                  await logout();
                  setIsMobileProfileOpen(false);
                  toast.success("Account deleted");
                } catch (error) {
                  toast.error(error?.response?.data?.message || "Failed to delete account");
                }
              }}
              className="mt-4 shrink-0 rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Delete Account
            </button>
          </form>
        </div>
      ) : null}

      {previewMedia ? (
        <div className="fixed inset-0 z-[60] flex min-h-[100dvh] flex-col overflow-hidden bg-[#111312] text-white">
          <div className="flex h-[74px] shrink-0 items-center justify-between border-b border-white/10 bg-[#1b1d1c] px-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar src={previewSender?.profilePic} name={previewSender?.fullName} className="h-11 w-11 rounded-full object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold sm:text-base">{previewSender?.fullName || "QuickChat user"}</p>
                <p className="truncate text-xs text-slate-300 sm:text-sm">{formatPreviewDateTime(previewMedia.createdAt)}</p>
              </div>
            </div>

            <div className="hidden items-center gap-3 text-white/80 sm:flex">
              <button
                type="button"
                onClick={() => setPreviewZoom((prev) => clampZoom(prev - 0.25))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 disabled:opacity-30"
                aria-label="Zoom out"
                disabled={previewMedia.type !== "image" || previewZoom <= 1}
              >
                <FiMinus />
              </button>
              <button
                type="button"
                onClick={() => setPreviewZoom((prev) => clampZoom(prev + 0.25))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 disabled:opacity-30"
                aria-label="Zoom in"
                disabled={previewMedia.type !== "image"}
              >
                <FiPlus />
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-white/90 sm:gap-4">
              <button
                type="button"
                onClick={handleSharePreview}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
                aria-label="Share media"
                title="Share"
              >
                <FiShare2 className="text-xl" />
              </button>
              <button
                type="button"
                onClick={handleDownloadPreview}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
                aria-label="Download media"
                title="Download"
              >
                <FiDownload className="text-xl" />
              </button>
              {previewMedia.type === "image" && (
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className="hidden h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 sm:inline-flex"
                  aria-label="Reset zoom"
                  title="Reset zoom"
                >
                  <FiRotateCcw className="text-xl" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
                aria-label="Close preview"
                title="Close"
              >
                <FiX className="text-2xl" />
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {previewableMedia.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => stepPreview(-1)}
                  className="absolute left-4 top-1/2 z-[62] inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/70 sm:left-9"
                  aria-label="Previous media"
                >
                  <FiChevronLeft className="text-2xl" />
                </button>
                <button
                  type="button"
                  onClick={() => stepPreview(1)}
                  className="absolute right-4 top-1/2 z-[62] inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/70 sm:right-9"
                  aria-label="Next media"
                >
                  <FiChevronRight className="text-2xl" />
                </button>
              </>
            )}

            <div
              className="flex h-full w-full items-center justify-center overflow-auto px-16 py-6 sm:px-24"
              onWheel={(e) => {
                if (previewMedia.type !== "image") return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                setPreviewZoom((prev) => clampZoom(prev + delta));
              }}
              onTouchStart={(e) => {
                if (previewMedia.type !== "image" || e.touches.length !== 2) return;
                pinchStateRef.current = {
                  distance: getTouchDistance(e.touches),
                  zoom: previewZoom,
                };
              }}
              onTouchMove={(e) => {
                if (previewMedia.type !== "image" || e.touches.length !== 2 || !pinchStateRef.current) return;
                const nextDistance = getTouchDistance(e.touches);
                const baseDistance = pinchStateRef.current.distance || nextDistance;
                const scaleRatio = nextDistance / baseDistance;
                setPreviewZoom(clampZoom(pinchStateRef.current.zoom * scaleRatio));
              }}
              onTouchEnd={() => {
                pinchStateRef.current = null;
              }}
            >
              {previewMedia.type === "image" ? (
                <img
                  src={previewMedia.src}
                  alt="Shared media preview"
                  className={`max-h-full max-w-full object-contain transition-transform duration-150 ${
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
              ) : (
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
                    isPortraitPreviewVideo ? "max-h-full max-w-[min(88vw,430px)]" : "max-h-full max-w-full"
                  }`}
                >
                  <source src={previewMedia.src} />
                </video>
              )}
            </div>
          </div>

          <div className="h-[104px] shrink-0 border-t border-white/10 bg-[#1b1d1c] px-2 py-2">
            <div className="chat-scroll flex h-full items-center gap-2 overflow-x-auto overflow-y-hidden">
              {previewableMedia.map((item, index) => {
                const active = item.id === previewMedia.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPreviewMedia(item);
                      setPreviewZoom(1);
                    }}
                    className={`relative h-20 w-24 shrink-0 overflow-hidden rounded border-4 bg-black transition ${
                      active ? "border-emerald-500" : "border-transparent opacity-75 hover:opacity-100"
                    }`}
                    aria-label={`Open media ${index + 1}`}
                  >
                    {item.type === "image" ? (
                      <img src={item.src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        <video className="h-full w-full object-cover">
                          <source src={item.src} />
                        </video>
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Video
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-[116px] left-1/2 hidden -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white shadow-2xl sm:flex">
            <span>{Math.round(previewZoom * 100)}%</span>
            {previewableMedia.length > 1 && (
              <span>
                {previewIndex + 1}/{previewableMedia.length}
              </span>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
