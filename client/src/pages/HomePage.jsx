import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiMenu,
  FiMic,
  FiMicOff,
  FiMinus,
  FiPhone,
  FiPhoneOff,
  FiPlus,
  FiRotateCcw,
  FiShare2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { api } from "../services/api";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import bgImage from "../assets/bgImage.svg";

const CALL_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const CALL_EVENT_POLL_INTERVAL_MS = 900;

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
  });
  const pinchStateRef = useRef(null);
  const remoteAudioRef = useRef(null);
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

  useEffect(() => {
    if (user?.encryptionPassphraseRequired) return;
    loadUsers().catch(() => toast.error("Failed to load users"));
  }, [user?.encryptionPassphraseRequired]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

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
  }

  function resetCall() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingOfferRef.current = null;
    callPeerIdRef.current = "";
    callIdRef.current = "";
    queuedIceCandidatesRef.current = [];
    stopCallMedia();
    setCallState({ status: "idle", direction: "", peer: null, muted: false });
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

  async function createPeerConnection(peerId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser microphone calling support nahi kar raha.");
    }

    const peerConnection = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
    peerConnectionRef.current = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal("ice", peerId, { candidate: event.candidate }).catch(() => null);
      }
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream || !remoteAudioRef.current) return;
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => null);
    };

    peerConnection.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
        if (callStateRef.current.status !== "idle") {
          resetCall();
        }
      }
    };

    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = localStream;
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
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
      setCallState({ status: "calling", direction: "outgoing", peer: selectedUser, muted: false });

      const peerConnection = await createPeerConnection(selectedUser._id);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await sendCallSignal("invite", selectedUser._id, { caller: getCallerSnapshot(), offer });
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
      await flushQueuedIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendCallSignal("accept", peerId, { answer });

      setCallState((prev) => ({ ...prev, status: "active" }));
      pendingOfferRef.current = null;
    } catch (error) {
      sendCallSignal("reject", peerId, { reason: "failed" }).catch(() => null);
      resetCall();
      toast.error(error?.message || "Call accept nahi ho pa rahi.");
    }
  }

  function rejectAudioCall() {
    const peerId = callPeerIdRef.current;
    if (peerId) sendCallSignal("reject", peerId, { reason: "rejected" }).catch(() => null);
    resetCall();
  }

  function endAudioCall() {
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
      setCallState({
        status: "ringing",
        direction: "incoming",
        peer: getCallPeer(from, payload.caller),
        muted: false,
      });
      return;
    }

    if (event.callId !== callIdRef.current || from !== callPeerIdRef.current) return;

    if (event.type === "accept") {
      if (!payload.answer || !peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        await flushQueuedIceCandidates();
        setCallState((prev) => ({ ...prev, status: "active" }));
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
      resetCall();
      toast.error(message);
      return;
    }

    if (event.type === "end" && callStateRef.current.status !== "idle") {
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
          className="fixed inset-0 z-30 bg-slate-900/55 xl:hidden"
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

      {callState.status !== "idle" && (
        <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto w-[min(94vw,430px)] overflow-hidden rounded-2xl border border-white/15 bg-[#12121a]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img
              src={callState.peer?.profilePic || "https://placehold.co/48x48?text=U"}
              alt={callState.peer?.fullName || "Caller"}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{callState.peer?.fullName || "QuickChat user"}</p>
              <p className="mt-0.5 text-xs text-slate-300">
                {callState.status === "ringing"
                  ? "Incoming audio call"
                  : callState.status === "calling"
                    ? "Calling..."
                    : callState.status === "connecting"
                      ? "Connecting..."
                      : callState.muted
                        ? "Audio call active - Muted"
                        : "Audio call active"}
              </p>
            </div>
            <FiPhone className="hidden h-5 w-5 text-emerald-300 sm:block" />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {callState.status === "ringing" ? (
              <>
                <button
                  type="button"
                  onClick={rejectAudioCall}
                  className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white hover:bg-rose-600"
                >
                  <FiPhoneOff />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={acceptAudioCall}
                  className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                >
                  <FiPhone />
                  Accept
                </button>
              </>
            ) : (
              <>
                {callState.status === "active" && (
                  <button
                    type="button"
                    onClick={toggleCallMute}
                    className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                  >
                    {callState.muted ? <FiMicOff /> : <FiMic />}
                    {callState.muted ? "Unmute" : "Mute"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={endAudioCall}
                  className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white hover:bg-rose-600"
                >
                  <FiPhoneOff />
                  End
                </button>
              </>
            )}
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
          isMobileOpen
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="min-h-0 h-full lg:col-span-8 xl:col-span-6">
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
          onStartAudioCall={startAudioCall}
          isCallDisabled={callState.status !== "idle" || !selectedUser?.isOnline}
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

      <div className="hidden xl:col-span-3 xl:block xl:h-full">
        {selectedUser ? (
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
          />
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
