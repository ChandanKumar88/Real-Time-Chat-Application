import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  FiCheckSquare,
  FiChevronDown,
  FiCopy,
  FiCornerUpLeft,
  FiGrid,
  FiImage,
  FiLock,
  FiPhone,
  FiSearch,
  FiSend,
  FiShare2,
  FiTrash2,
  FiVideo,
  FiX,
} from "react-icons/fi";
import logoIcon from "../assets/logo_icon.svg";
import ProfileAvatar from "./ProfileAvatar";
import { processImageFile } from "../utils/image";
import { api } from "../services/api";

const MAX_VIDEO_SIZE_MB = 50;

async function uploadVideoToCloudinary(file) {
  const { data } = await api.get("/messages/upload/signature");
  const uploadConfig = data.data;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", uploadConfig.apiKey);
  formData.append("timestamp", uploadConfig.timestamp);
  formData.append("signature", uploadConfig.signature);
  formData.append("folder", uploadConfig.folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${uploadConfig.cloudName}/video/upload`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Video upload failed");
  }
  return result.secure_url;
}

export default function ChatContainer({
  user,
  selectedUser,
  messages,
  messagesLoading = false,
  olderMessagesLoading = false,
  hasOlderMessages = false,
  onLoadOlderMessages,
  text,
  setText,
  onTextChange,
  setImage,
  setVideo,
  image = "",
  video = "",
  replyToMessage = null,
  isTyping = false,
  onSend,
  onDeleteMessage,
  onDeleteMessages,
  onReplyMessage,
  onCancelReply,
  onStartAudioCall,
  onStartVideoCall,
  isCallDisabled = false,
  onOpenMedia,
  onOpenSharedMedia,
  onOpenSearchPanel,
  searchKeyword = "",
  activeSearchMessageId = "",
  searchJumpKey = 0,
  onPreviewMedia,
  forwardUsers = [],
  onForwardMessages,
  theme = "dark",
}) {
  const imageInputRef = useRef(null);
  const textInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageRefs = useRef(new Map());
  const longPressTimerRef = useRef(null);
  const longPressStateRef = useRef(null);
  const forwardSearchInputRef = useRef(null);
  const ignoreNextDocumentClickRef = useRef(false);
  const isUserNearBottomRef = useRef(true);
  const initialLoadUserRef = useRef("");
  const previousMessagesRef = useRef({ userId: "", length: 0, lastId: "" });
  const olderMessagesInFlightRef = useRef(false);
  const pendingOlderScrollRef = useRef(null);
  const [mediaError, setMediaError] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const [swipeState, setSwipeState] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isForwardMode, setIsForwardMode] = useState(false);
  const [selectedForwardMessageIds, setSelectedForwardMessageIds] = useState([]);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [selectedForwardUserIds, setSelectedForwardUserIds] = useState([]);
  const [forwardNote, setForwardNote] = useState("");
  const [isForwardSending, setIsForwardSending] = useState(false);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const isDark = theme === "dark";

  const selectedForwardMessages = useMemo(
    () => selectedForwardMessageIds.map((messageId) => messages.find((message) => message._id === messageId)).filter(Boolean),
    [messages, selectedForwardMessageIds]
  );
  const filteredForwardUsers = useMemo(() => {
    const keyword = forwardSearch.trim().toLowerCase();
    return (forwardUsers || []).filter((item) => {
      if (!item?._id || item._id === user?._id) return false;
      if (!keyword) return true;
      return (item.fullName || "").toLowerCase().includes(keyword);
    });
  }, [forwardSearch, forwardUsers, user?._id]);
  const selectedForwardUsers = useMemo(
    () => selectedForwardUserIds.map((userId) => (forwardUsers || []).find((item) => item._id === userId)).filter(Boolean),
    [forwardUsers, selectedForwardUserIds]
  );
  const selectedForwardOwnMessages = useMemo(
    () => selectedForwardMessages.filter((message) => message.senderId === user?._id && !message.pending),
    [selectedForwardMessages, user?._id]
  );
  const activeMenuMessage = useMemo(
    () => messages.find((message) => message._id === openMenuId) || null,
    [messages, openMenuId]
  );

  function getIsNearBottom() {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function syncScrollButtonState() {
    const el = messagesContainerRef.current;
    const nearBottom = getIsNearBottom();
    isUserNearBottomRef.current = nearBottom;
    setIsUserNearBottom(nearBottom);
    setShowScrollButton(!nearBottom && Boolean(el && el.scrollHeight > el.clientHeight + 8));
    if (nearBottom) setNewMessageCount(0);
  }

  function scrollToBottom(behavior = "smooth") {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isUserNearBottomRef.current = true;
    setIsUserNearBottom(true);
    setShowScrollButton(false);
    setNewMessageCount(0);
  }

  function handleMessagesScroll() {
    syncScrollButtonState();
    const el = messagesContainerRef.current;
    if (!el || el.scrollTop > 96 || !hasOlderMessages || olderMessagesLoading || olderMessagesInFlightRef.current) return;

    pendingOlderScrollRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
    olderMessagesInFlightRef.current = true;
    Promise.resolve(onLoadOlderMessages?.()).finally(() => {
      olderMessagesInFlightRef.current = false;
    });
  }

  useLayoutEffect(() => {
    const selectedUserId = selectedUser?._id || "";
    initialLoadUserRef.current = selectedUserId;
    pendingOlderScrollRef.current = null;
    olderMessagesInFlightRef.current = false;
    isUserNearBottomRef.current = true;
    setIsUserNearBottom(true);
    setShowScrollButton(false);
    setNewMessageCount(0);
    previousMessagesRef.current = {
      userId: selectedUserId,
      length: messages.length,
      lastId: messages.at(-1)?._id || "",
    };

    window.requestAnimationFrame(syncScrollButtonState);
  }, [selectedUser?._id]);

  useLayoutEffect(() => {
    const pendingScroll = pendingOlderScrollRef.current;
    const el = messagesContainerRef.current;
    if (!pendingScroll || !el) return;

    window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - pendingScroll.scrollHeight + pendingScroll.scrollTop;
      pendingOlderScrollRef.current = null;
      syncScrollButtonState();
    });
  }, [messages.length]);

  useLayoutEffect(() => {
    const selectedUserId = selectedUser?._id || "";
    const lastMessage = messages.at(-1);
    const lastId = lastMessage?._id || "";
    const previous = previousMessagesRef.current;
    const sameConversation = previous.userId === selectedUserId;
    const messageAdded = sameConversation && messages.length > previous.length && lastId !== previous.lastId;
    const isInitialLoad = initialLoadUserRef.current === selectedUserId;

    previousMessagesRef.current = { userId: selectedUserId, length: messages.length, lastId };

    if (isInitialLoad) {
      if (messages.length > 0) {
        initialLoadUserRef.current = "";
        window.requestAnimationFrame(() => scrollToBottom("auto"));
        return;
      }

      if (!messagesLoading) {
        initialLoadUserRef.current = "";
      }
      window.requestAnimationFrame(syncScrollButtonState);
      return;
    }

    if (messageAdded && (lastMessage?.senderId === user._id || isUserNearBottomRef.current)) {
      window.requestAnimationFrame(() => scrollToBottom("smooth"));
      return;
    }

    if (messageAdded && lastMessage?.senderId !== user._id && !isUserNearBottomRef.current) {
      setNewMessageCount((count) => count + 1);
      setShowScrollButton(true);
    }

    window.requestAnimationFrame(syncScrollButtonState);
  }, [messages, messagesLoading, selectedUser?._id, user?._id]);

  useEffect(() => {
    if (!openMenuId) return;

    function closeMenu() {
      if (ignoreNextDocumentClickRef.current) {
        ignoreNextDocumentClickRef.current = false;
        return;
      }
      setOpenMenuId("");
      setMenuPosition(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!isForwardMode && !isForwardModalOpen) return;

    function handleForwardKeyDown(event) {
      if (event.key === "Escape") {
        if (isForwardModalOpen) {
          setIsForwardModalOpen(false);
          return;
        }
        closeForwardMode();
      }

      if (event.key === "Enter" && isForwardModalOpen && selectedForwardUserIds.length > 0) {
        event.preventDefault();
        sendForwardedMessages();
      }
    }

    document.addEventListener("keydown", handleForwardKeyDown);
    return () => document.removeEventListener("keydown", handleForwardKeyDown);
  }, [isForwardMode, isForwardModalOpen, selectedForwardUserIds, selectedForwardMessages, selectedForwardUsers, forwardNote]);

  useEffect(
    () => () => {
      window.clearTimeout(longPressTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!activeSearchMessageId) return;
    const node = messageRefs.current.get(activeSearchMessageId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSearchMessageId, searchJumpKey]);

  function formatMessageTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getMessageId(value) {
    return value?._id || value || "";
  }

  function getMessagePreview(message) {
    if (!message) return "Original message";
    if (message.decryptionFailed) return "Message can't be opened on this device";
    if (message.text) return message.text;
    if (message.image) return "Photo";
    if (message.video) return "Video";
    return "Message";
  }

  function getMessageAuthor(message) {
    if (!message) return "Message";
    return message.senderId === user._id ? "You" : selectedUser?.fullName || "User";
  }

  function getReplyMessage(message) {
    const replyId = getMessageId(message?.replyTo);
    if (!replyId) return null;
    return messages.find((item) => item._id === replyId) || null;
  }

  function getHighlightedText(value) {
    const keyword = searchKeyword.trim();
    if (!keyword || !value) return value;

    const lowerValue = value.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const parts = [];
    let cursor = 0;
    let matchIndex = lowerValue.indexOf(lowerKeyword);

    while (matchIndex !== -1) {
      if (matchIndex > cursor) parts.push(value.slice(cursor, matchIndex));
      parts.push(
        <mark key={`${matchIndex}-${keyword}`} className={`rounded px-0.5 ${isDark ? "bg-amber-300/80 text-slate-950" : "bg-amber-200 text-slate-950"}`}>
          {value.slice(matchIndex, matchIndex + keyword.length)}
        </mark>
      );
      cursor = matchIndex + keyword.length;
      matchIndex = lowerValue.indexOf(lowerKeyword, cursor);
    }

    if (cursor < value.length) parts.push(value.slice(cursor));
    return parts;
  }

  function selectReply(message) {
    onReplyMessage?.(message);
    setOpenMenuId("");
    setMenuPosition(null);
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  }

  function getImageFileName(src) {
    if (!src) return "QuickChat image";
    try {
      const pathname = new URL(src).pathname;
      const fileName = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
      return fileName || "QuickChat image";
    } catch {
      return "QuickChat image";
    }
  }

  async function getClipboardImageBlob(src) {
    const response = await fetch(src);
    const sourceBlob = await response.blob();
    if (sourceBlob.type === "image/png") return sourceBlob;

    const bitmap = await createImageBitmap(sourceBlob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to prepare image for clipboard"));
      }, "image/png");
    });
  }

  async function copyImageMessage(message) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      await navigator.clipboard.writeText(message.image);
      toast.success("Image link copied");
      return;
    }

    const imageBlob = await getClipboardImageBlob(message.image);
    await navigator.clipboard.write([new ClipboardItem({ [imageBlob.type || "image/png"]: imageBlob })]);
    toast.success(`File copied: ${getImageFileName(message.image)}`);
  }

  async function copyMessage(message) {
    const copyText = message?.text || "";

    try {
      if (message?.image) {
        await copyImageMessage(message);
      } else if (copyText.trim()) {
        await navigator.clipboard.writeText(copyText);
        toast.success("Message copied");
      } else if (message?.video) {
        await navigator.clipboard.writeText(message.video);
        toast.success("Video link copied");
      } else {
        toast.error("Is message me copy karne layak content nahi hai.");
      }
    } catch {
      toast.error(message?.image ? "Image copy nahi ho paayi." : "Message copy nahi ho paaya.");
    } finally {
      setOpenMenuId("");
      setMenuPosition(null);
    }
  }

  async function copySelectedMessages() {
    if (selectedForwardMessages.length === 0) {
      toast.error("Copy karne ke liye message select karo.");
      return;
    }

    if (selectedForwardMessages.length === 1) {
      await copyMessage(selectedForwardMessages[0]);
      return;
    }

    const copyValue = [...selectedForwardMessages]
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .map((message) => {
        if (message.decryptionFailed) return "";
        if (message.text) return message.text;
        if (message.image) return message.image;
        if (message.video) return message.video;
        return "";
      })
      .filter(Boolean)
      .join("\n");

    if (!copyValue.trim()) {
      toast.error("Selected messages me copy karne layak content nahi hai.");
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      toast.success(`${selectedForwardMessages.length} selected messages copied`);
    } catch {
      toast.error("Selected messages copy nahi ho paaye.");
    }
  }

  function startForwardMode(message) {
    if (!message?._id) return;
    setOpenMenuId("");
    setMenuPosition(null);
    setIsForwardMode(true);
    setSelectedForwardMessageIds([message._id]);
    setIsForwardModalOpen(false);
    setSelectedForwardUserIds([]);
    setForwardSearch("");
    setForwardNote("");
  }

  function closeForwardMode() {
    setIsForwardMode(false);
    setSelectedForwardMessageIds([]);
    setIsForwardModalOpen(false);
    setSelectedForwardUserIds([]);
    setForwardSearch("");
    setForwardNote("");
    setIsForwardSending(false);
  }

  function toggleForwardMessage(messageId) {
    if (!messageId) return;
    setSelectedForwardMessageIds((prev) => {
      if (prev.includes(messageId)) return prev.filter((id) => id !== messageId);
      return [...prev, messageId];
    });
  }

  function toggleForwardUser(userId) {
    if (!userId) return;
    setSelectedForwardUserIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      return [...prev, userId];
    });
  }

  function openForwardModal() {
    if (selectedForwardMessages.length === 0) {
      toast.error("Forward karne ke liye message select karo.");
      return;
    }
    setIsForwardModalOpen(true);
    window.setTimeout(() => forwardSearchInputRef.current?.focus(), 60);
  }

  async function sendForwardedMessages() {
    if (!onForwardMessages) return;
    if (selectedForwardMessages.length === 0) {
      toast.error("Forward karne ke liye message select karo.");
      return;
    }
    if (selectedForwardUsers.length === 0) {
      toast.error("Forward karne ke liye user select karo.");
      return;
    }

    setIsForwardSending(true);
    try {
      await onForwardMessages({
        messages: selectedForwardMessages,
        users: selectedForwardUsers,
        note: forwardNote.trim(),
      });
      toast.success(`Forwarded to ${selectedForwardUsers.length} chat${selectedForwardUsers.length === 1 ? "" : "s"}`);
      closeForwardMode();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Forward failed");
      setIsForwardSending(false);
    }
  }

  async function deleteSelectedMessages() {
    if (selectedForwardMessages.length === 0) {
      toast.error("Delete karne ke liye message select karo.");
      return;
    }

    if (selectedForwardOwnMessages.length === 0) {
      toast.error("Sirf apne sent messages delete ho sakte hain.");
      return;
    }

    try {
      if (onDeleteMessages) {
        await onDeleteMessages(selectedForwardOwnMessages.map((message) => message._id));
      } else {
        for (const message of selectedForwardOwnMessages) {
          await onDeleteMessage?.(message._id);
        }
      }
      const deletedIds = new Set(selectedForwardOwnMessages.map((message) => message._id));
      setSelectedForwardMessageIds((prev) => prev.filter((id) => !deletedIds.has(id)));
      if (selectedForwardOwnMessages.length === selectedForwardMessages.length) closeForwardMode();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Selected messages delete nahi ho paaye.");
    }
  }

  function getForwardPreview(message) {
    if (!message) return "Message";
    if (message.decryptionFailed) return "Locked message";
    if (message.text) return message.text;
    if (message.image) return "Photo";
    if (message.video) return "Video";
    return "Message";
  }

  function clearLongPressTimer() {
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function handleTouchStart(event, message) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    clearLongPressTimer();
    longPressStateRef.current = {
      id: message._id,
      startX: touch.clientX,
      startY: touch.clientY,
      triggered: false,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      if (longPressStateRef.current?.id !== message._id) return;
      longPressStateRef.current.triggered = true;
      ignoreNextDocumentClickRef.current = true;
      setSwipeState(null);
      setOpenMenuId(message._id);
      setMenuPosition(
        getSmartMenuPosition({
          point: { x: touch.clientX, y: touch.clientY },
          isMine: message.senderId === user?._id,
          hasDelete: message.senderId === user?._id && !message.pending,
        })
      );
      navigator.vibrate?.(20);
    }, 550);
    setSwipeState({ id: message._id, startX: touch.clientX, startY: touch.clientY, offset: 0 });
  }

  function handleTouchMove(event, message) {
    const activeLongPress = longPressStateRef.current;
    if (activeLongPress?.id === message._id && event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - activeLongPress.startX;
      const dy = touch.clientY - activeLongPress.startY;
      if (Math.hypot(dx, dy) > 10) {
        clearLongPressTimer();
      }
    }

    if (!swipeState || swipeState.id !== message._id || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipeState.startX;
    const dy = Math.abs(touch.clientY - swipeState.startY);
    if (dy > 42 && Math.abs(dx) < 24) {
      setSwipeState(null);
      return;
    }

    const nextOffset = Math.max(0, Math.min(76, dx));
    if (nextOffset > 4) event.preventDefault();
    setSwipeState((prev) => (prev ? { ...prev, offset: nextOffset } : prev));
  }

  function handleTouchEnd(message) {
    const wasLongPressed = longPressStateRef.current?.id === message._id && longPressStateRef.current.triggered;
    clearLongPressTimer();
    longPressStateRef.current = null;
    if (wasLongPressed) {
      setSwipeState(null);
      return;
    }

    if (swipeState?.id === message._id && swipeState.offset >= 54) {
      selectReply(message);
    }
    setSwipeState(null);
  }

  function cancelTouchActions() {
    clearLongPressTimer();
    longPressStateRef.current = null;
    setSwipeState(null);
  }

  function getSmartMenuPosition({ rect, point, isMine, hasDelete }) {
    const menuWidth = 224;
    const menuHeight = hasDelete ? 216 : 176;
    const gutter = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchorTop = rect?.top ?? point?.y ?? gutter;
    const anchorBottom = rect?.bottom ?? point?.y ?? anchorTop;
    const anchorLeft = rect?.left ?? point?.x ?? gutter;
    const anchorRight = rect?.right ?? point?.x ?? anchorLeft;
    const spaceBelow = viewportHeight - anchorBottom;
    const spaceAbove = anchorTop;
    const shouldOpenBelow = spaceBelow >= menuHeight + gutter || spaceBelow >= spaceAbove;
    const rawTop = shouldOpenBelow ? anchorBottom + gutter : anchorTop - menuHeight - gutter;
    const rawLeft = isMine ? anchorRight - menuWidth : anchorLeft;

    return {
      top: Math.min(Math.max(gutter, rawTop), Math.max(gutter, viewportHeight - menuHeight - gutter)),
      left: Math.min(Math.max(gutter, rawLeft), Math.max(gutter, viewportWidth - menuWidth - gutter)),
      width: menuWidth,
    };
  }

  function openMessageMenu(message, event, isMine) {
    event.preventDefault();
    event.stopPropagation();

    if (openMenuId === message._id) {
      setOpenMenuId("");
      setMenuPosition(null);
      return;
    }

    const anchor = event.currentTarget.closest("[data-message-bubble='true']") || event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    setMenuPosition(getSmartMenuPosition({ rect, isMine, hasDelete: isMine && !message.pending }));
    setOpenMenuId(message._id);
  }

  function openContactPanel() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      onOpenMedia?.();
      return;
    }

    onOpenSharedMedia?.();
  }

  if (!selectedUser) {
    return (
      <main className={`grid h-full min-h-0 place-items-center overflow-hidden rounded-2xl p-5 ${isDark ? "border border-white/10 bg-black/10" : "border border-slate-300 bg-white/70"}`}>
        <div className="text-center">
          <img src={logoIcon} alt="QuickChat" className="mx-auto mb-3 h-12 w-12 opacity-90" />
          <p className={`text-xl font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>Chat anytime, anywhere</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`relative grid h-full min-h-0 grid-rows-[54px,minmax(0,1fr),auto] overflow-hidden rounded-2xl p-1 backdrop-blur-sm sm:grid-rows-[64px,minmax(0,1fr),auto] sm:p-3 lg:grid-rows-[70px,minmax(0,1fr),auto] lg:p-0 ${isDark ? "border border-white/10 bg-black/15" : "border border-slate-300 bg-white/70"}`}>
      <header className={`flex h-[54px] items-center justify-between rounded-xl px-2.5 sm:h-[64px] sm:px-3 lg:h-[70px] lg:rounded-none lg:border-x-0 lg:border-t-0 lg:px-5 ${
        isDark ? "border border-white/10 bg-white/5 lg:border-white/10 lg:bg-[#111111]/95" : "border border-slate-200 bg-white/80 lg:border-slate-200 lg:bg-white/95"
      }`}>
        <button
          type="button"
          onClick={openContactPanel}
          className={`flex min-w-0 items-center gap-2.5 rounded-xl pr-2 text-left transition sm:gap-3 lg:gap-4 lg:pr-4 ${
            isDark ? "hover:bg-white/5" : "hover:bg-slate-100/70"
          }`}
          aria-label="Open contact info"
          title="Open contact info"
        >
          <ProfileAvatar src={selectedUser.profilePic} name={selectedUser.fullName} className="h-8 w-8 shrink-0 rounded-full object-cover sm:h-9 sm:w-9 lg:h-12 lg:w-12" />
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold lg:text-lg ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedUser.fullName}</p>
            <p
              className={`inline-flex items-center gap-1.5 text-xs lg:hidden ${
                isTyping ? "text-violet-300" : selectedUser.isOnline ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isTyping ? "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.9)]" : selectedUser.isOnline ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {isTyping ? "Typing..." : selectedUser.isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={openContactPanel}
          className="hidden min-w-0 flex-1 self-stretch lg:block"
          aria-label="Open contact info"
          title="Open contact info"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onStartAudioCall}
            disabled={isCallDisabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition sm:h-9 sm:w-9 lg:hidden ${
              isDark
                ? "border border-white/10 bg-white/5 text-emerald-300 hover:bg-white/10 disabled:text-slate-600"
                : "border border-slate-200 bg-white text-emerald-600 hover:bg-slate-100 disabled:text-slate-300"
            } disabled:cursor-not-allowed`}
            title={isCallDisabled ? "Audio call unavailable" : "Audio call"}
          >
            <FiPhone />
          </button>
          <button
            type="button"
            onClick={onOpenMedia}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg lg:hidden sm:h-9 sm:w-9 ${isDark ? "border border-white/10 bg-white/5 text-slate-300" : "border border-slate-200 bg-white text-slate-700"}`}
            title="Open media"
          >
            <FiGrid />
          </button>
          <div className="hidden items-center gap-5 lg:flex">
            <button
              type="button"
              onClick={onStartVideoCall}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl transition ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-800 hover:bg-slate-100"
              }`}
              title="Video call"
            >
              <FiVideo />
            </button>
            <button
              type="button"
              onClick={onStartAudioCall}
              disabled={isCallDisabled}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-800 hover:bg-slate-100"
              }`}
              title={isCallDisabled ? "Audio call unavailable" : "Audio call"}
            >
              <FiPhone />
            </button>
            <button
              type="button"
              onClick={onOpenSearchPanel}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl transition ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-800 hover:bg-slate-100"
              }`}
              title="Search messages"
            >
              <FiSearch />
            </button>
          </div>
        </div>
      </header>

      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className={`chat-scroll min-h-0 overflow-x-hidden overflow-y-auto rounded-xl ${isDark ? "bg-black/20" : "bg-white/60"}`}
      >
        <div className="space-y-2 p-1.5 sm:p-3">
        {olderMessagesLoading && (
          <div className="flex justify-center py-1">
            <span className={`rounded-full px-3 py-1 text-xs ${isDark ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>
              Loading older messages...
            </span>
          </div>
        )}
        {messagesLoading && messages.length === 0 && (
          <div className="space-y-3 py-3" aria-label="Messages loading">
            <div className={`h-10 w-36 animate-pulse rounded-2xl ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
            <div className={`ml-auto h-10 w-44 animate-pulse rounded-2xl ${isDark ? "bg-violet-500/25" : "bg-violet-100"}`} />
            <div className={`h-10 w-28 animate-pulse rounded-2xl ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
          </div>
        )}
        {messages.map((m) => {
          const isMine = m.senderId === user._id;
          const avatarSrc = isMine ? user?.profilePic || "https://placehold.co/28x28?text=U" : selectedUser?.profilePic || "https://placehold.co/28x28?text=U";
          const repliedMessage = getReplyMessage(m);
          const swipeOffset = swipeState?.id === m._id ? swipeState.offset : 0;
          const matchesSearch = Boolean(searchKeyword.trim() && m.text?.toLowerCase().includes(searchKeyword.trim().toLowerCase()));
          const isActiveSearchMatch = activeSearchMessageId === m._id;
          const isForwardSelected = selectedForwardMessageIds.includes(m._id);
          const isForwardedMessage = Boolean(m.isForwarded || m.originalMessageId || m.forwardedFrom);
          return (
            <div
              key={m._id}
              ref={(node) => {
                if (node) messageRefs.current.set(m._id, node);
                else messageRefs.current.delete(m._id);
              }}
              className={`relative flex ${isForwardMode ? "pl-10" : ""} ${isMine ? "justify-end" : "justify-start"}`}
              onClick={() => {
                if (isForwardMode) toggleForwardMessage(m._id);
              }}
              onTouchStart={(event) => handleTouchStart(event, m)}
              onTouchMove={(event) => handleTouchMove(event, m)}
              onTouchEnd={() => handleTouchEnd(m)}
              onTouchCancel={cancelTouchActions}
              onContextMenu={(event) => {
                openMessageMenu(m, event, isMine);
              }}
            >
              {isForwardMode && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleForwardMessage(m._id);
                  }}
                  className={`absolute left-1 top-1/2 z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md border transition ${
                    isForwardSelected
                      ? "border-violet-400 bg-violet-500 text-white"
                      : isDark
                        ? "border-white/30 bg-black/50 text-transparent hover:border-violet-300"
                        : "border-slate-400 bg-white text-transparent hover:border-violet-500"
                  }`}
                  aria-label={isForwardSelected ? "Unselect message" : "Select message"}
                  title={isForwardSelected ? "Unselect message" : "Select message"}
                >
                  {isForwardSelected && <FiCheckSquare className="h-4 w-4" />}
                </button>
              )}
              {swipeOffset > 10 && (
                <div className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 ${isDark ? "bg-white/10 text-violet-200" : "bg-violet-100 text-violet-700"}`}>
                  <FiCornerUpLeft />
                </div>
              )}
              <div
                className={`flex max-w-[92%] flex-col transition-transform sm:max-w-[82%] ${isMine ? "items-end" : "items-start"}`}
                style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined }}
              >
                <div
                  data-message-bubble="true"
                  onClick={(event) => {
                    if (isForwardMode) return;
                    if (event.target.closest("[data-message-menu='true']") || event.target.closest("[data-menu-control='true']")) {
                      return;
                    }
                    openMessageMenu(m, event, isMine);
                  }}
                  className={`group relative max-w-full rounded-2xl px-2.5 py-2 transition sm:px-3 ${
                    isMine ? "bg-violet-600 text-white" : isDark ? "bg-white/10 text-slate-100" : "bg-slate-100 text-slate-800"
                  } ${matchesSearch ? (isActiveSearchMatch ? "ring-2 ring-amber-300/90" : "ring-1 ring-amber-300/45") : ""} ${
                    isForwardSelected ? "ring-2 ring-emerald-400/80" : ""
                  }`}
                >
                  <button
                    type="button"
                    data-menu-control="true"
                    onClick={(event) => {
                      openMessageMenu(m, event, isMine);
                    }}
                    className={`absolute top-1 hidden h-7 w-7 items-center justify-center rounded-full text-sm opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 sm:inline-flex ${
                      isMine ? "right-1 bg-black/10 text-white hover:bg-black/20" : "right-1 bg-black/10 text-slate-200 hover:bg-black/20"
                    }`}
                    aria-label="Message options"
                  >
                    <FiChevronDown />
                  </button>
                  {isForwardedMessage && (
                    <p
                      className={`mb-1 flex items-center gap-1 text-left text-[12px] italic leading-none ${
                        isMine ? "text-white/75" : isDark ? "text-slate-300/80" : "text-slate-500"
                      }`}
                    >
                      <span className="text-[13px] leading-none">{"\u21AA"}</span>
                      <span>Forwarded</span>
                    </p>
                  )}
                  {!!getMessageId(m.replyTo) && (
                    <div className={`mb-2 max-w-[min(70vw,320px)] rounded-xl border-l-2 px-2.5 py-2 text-xs ${isMine ? "border-white/70 bg-black/15 text-white/90" : isDark ? "border-violet-300 bg-black/25 text-slate-200" : "border-violet-500 bg-white/80 text-slate-700"}`}>
                      <p className={`truncate font-semibold ${isMine ? "text-white" : "text-violet-300"}`}>{getMessageAuthor(repliedMessage)}</p>
                      <p className="line-clamp-2 break-words opacity-85">{getMessagePreview(repliedMessage)}</p>
                    </div>
                  )}
                  {m.decryptionFailed && (
                    <div
                      className={`flex max-w-[min(70vw,360px)] items-center gap-2 rounded-xl px-2.5 py-2 text-xs sm:text-sm ${
                        isMine
                          ? "bg-black/15 text-white/90"
                          : isDark
                            ? "bg-black/25 text-slate-200"
                            : "bg-white/80 text-slate-700"
                      }`}
                    >
                      <FiLock className="h-4 w-4 shrink-0" />
                      <span className="break-words">Message can't be opened on this device.</span>
                    </div>
                  )}
                  {!!m.text && <p className="break-words text-sm">{getHighlightedText(m.text)}</p>}
                  {!!m.image && (
                    <div
                      data-media-preview="true"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        if (isForwardMode) {
                          event.stopPropagation();
                          toggleForwardMessage(m._id);
                          return;
                        }
                        openMessageMenu(m, event, isMine);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuId("");
                        setMenuPosition(null);
                        onPreviewMedia?.({ id: m._id, type: "image", src: m.image });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMessageMenu(m, e, isMine);
                        }
                      }}
                      className="mt-2 block max-w-full cursor-pointer"
                    >
                      <img src={m.image} className="block max-h-56 w-full max-w-[min(58vw,240px)] rounded-xl object-cover sm:max-h-64 sm:max-w-full" />
                    </div>
                  )}
                  {!!m.video && (
                    <div
                      data-media-preview="true"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        if (isForwardMode) {
                          event.stopPropagation();
                          toggleForwardMessage(m._id);
                          return;
                        }
                        openMessageMenu(m, event, isMine);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuId("");
                        setMenuPosition(null);
                        onPreviewMedia?.({ id: m._id, type: "video", src: m.video });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMessageMenu(m, e, isMine);
                        }
                      }}
                      className="mt-2 block max-w-full cursor-pointer"
                    >
                      <video className="block max-h-56 w-full max-w-[min(58vw,240px)] rounded-xl object-cover sm:max-h-64 sm:max-w-full" muted playsInline>
                        <source src={m.video} />
                      </video>
                    </div>
                  )}
                </div>
                <div className={`mt-1 flex items-center gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                  <ProfileAvatar src={avatarSrc} name={isMine ? user?.fullName : selectedUser?.fullName} className="h-5 w-5 rounded-full object-cover opacity-90" />
                  <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{formatMessageTime(m.createdAt)}</p>
                  {m.pending && <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-600"}`}>Uploading...</p>}
                  {isMine && <p className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>{m.seen ? "Seen" : "Sent"}</p>}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {activeMenuMessage && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          data-message-menu="true"
          onClick={(event) => event.stopPropagation()}
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
          className={`fixed z-[120] max-h-[min(72vh,420px)] overflow-y-auto rounded-xl border py-1.5 text-sm shadow-2xl backdrop-blur-md ${
            isDark ? "border-white/10 bg-[#15151c] text-slate-100" : "border-slate-200 bg-white text-slate-800"
          }`}
        >
          <button
            type="button"
            onClick={() => selectReply(activeMenuMessage)}
            className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
          >
            <FiCornerUpLeft className="h-4 w-4 shrink-0" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => copyMessage(activeMenuMessage)}
            className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
          >
            <FiCopy className="h-4 w-4 shrink-0" />
            Copy
          </button>
          <button
            type="button"
            onClick={() => startForwardMode(activeMenuMessage)}
            className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
          >
            <FiShare2 className="h-4 w-4 shrink-0" />
            Forward
          </button>
          <button
            type="button"
            onClick={() => startForwardMode(activeMenuMessage)}
            className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
          >
            <FiCheckSquare className="h-4 w-4 shrink-0" />
            Select
          </button>
          {activeMenuMessage.senderId === user?._id && !activeMenuMessage.pending && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuId("");
                setMenuPosition(null);
                onDeleteMessage?.(activeMenuMessage._id);
              }}
              className={`flex w-full items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-left font-medium ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
            >
              <FiTrash2 className="h-4 w-4 shrink-0" />
              Delete
            </button>
          )}
        </div>,
        document.body
      )}

      {showScrollButton && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className={`absolute bottom-16 right-4 z-30 grid h-9 w-9 place-items-center rounded-full border shadow-xl transition hover:scale-105 sm:bottom-20 sm:right-6 ${
            isDark
              ? "border-white/10 bg-[#15151c]/95 text-slate-100 shadow-black/30 hover:bg-[#1f2030]"
              : "border-slate-200 bg-white text-slate-700 shadow-slate-300/60 hover:bg-slate-50"
          }`}
          aria-label="Scroll to latest message"
          title={newMessageCount > 0 ? `${newMessageCount} new message${newMessageCount === 1 ? "" : "s"}` : "Scroll to latest message"}
        >
          <FiChevronDown />
          {newMessageCount > 0 && (
            <span className="absolute -top-2 -right-2 grid min-h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-emerald-950/30">
              {newMessageCount > 9 ? "9+" : newMessageCount}
            </span>
          )}
        </button>
      )}

      {isForwardMode && (
        <div className={`mt-1 flex h-[58px] shrink-0 items-center justify-between rounded-xl px-3 sm:mt-2 ${
          isDark ? "border border-white/10 bg-[#15151c]/95 text-slate-100" : "border border-slate-300 bg-white text-slate-800"
        }`}>
          <button
            type="button"
            onClick={closeForwardMode}
            className={`inline-flex items-center gap-3 rounded-full px-2 py-2 font-semibold ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
            aria-label="Exit selection mode"
          >
            <FiX className="h-5 w-5" />
            <span>{selectedForwardMessages.length} selected</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={copySelectedMessages}
              disabled={selectedForwardMessages.length === 0}
              className={`grid h-10 w-10 place-items-center rounded-full text-xl transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45 ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-label="Copy selected messages"
              title="Copy"
            >
              <FiCopy />
            </button>
            <button
              type="button"
              onClick={deleteSelectedMessages}
              disabled={selectedForwardOwnMessages.length === 0}
              className={`grid h-10 w-10 place-items-center rounded-full text-xl transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45 ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-label="Delete selected messages"
              title={selectedForwardOwnMessages.length === 0 ? "Only your sent messages can be deleted" : "Delete"}
            >
              <FiTrash2 />
            </button>
            <button
              type="button"
              onClick={openForwardModal}
              disabled={selectedForwardMessages.length === 0}
              className={`grid h-10 w-10 place-items-center rounded-full text-xl transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45 ${
                isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-label="Forward selected messages"
              title="Forward"
            >
              <FiShare2 />
            </button>
          </div>
        </div>
      )}

      {isForwardModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsForwardModalOpen(false);
          }}
        >
          <section
            className={`flex h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:h-[min(84vh,760px)] sm:rounded-3xl ${
              isDark ? "border border-white/10 bg-[#151515] text-slate-100" : "border border-slate-200 bg-white text-slate-900"
            }`}
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Forward message to"
          >
            <div className="flex shrink-0 items-center gap-3 px-4 py-4">
              <button
                type="button"
                onClick={() => setIsForwardModalOpen(false)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isDark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                aria-label="Close forward panel"
              >
                <FiX className="h-5 w-5" />
              </button>
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">Forward message to</h3>
            </div>

            <div className="shrink-0 px-4 pb-3">
              <div className={`relative rounded-full border ${isDark ? "border-white/80 bg-white/5" : "border-slate-300 bg-slate-50"}`}>
                <FiSearch className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-300" : "text-slate-500"}`} />
                <input
                  ref={forwardSearchInputRef}
                  value={forwardSearch}
                  onChange={(event) => setForwardSearch(event.target.value)}
                  className={`h-12 w-full rounded-full bg-transparent pl-12 pr-4 outline-none ${isDark ? "text-slate-100 placeholder:text-slate-400" : "text-slate-900 placeholder:text-slate-500"}`}
                  placeholder="Search name"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <p className={`px-3 py-3 text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Recent chats</p>
              {filteredForwardUsers.length === 0 ? (
                <p className={`px-3 py-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>No user found.</p>
              ) : (
                filteredForwardUsers.map((item) => {
                  const isSelected = selectedForwardUserIds.includes(item._id);
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => toggleForwardUser(item._id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        isSelected
                          ? isDark
                            ? "bg-violet-500/18"
                            : "bg-violet-50"
                          : isDark
                            ? "hover:bg-white/10"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                        isSelected
                          ? "border-violet-400 bg-violet-500 text-white"
                          : isDark
                            ? "border-slate-500 text-transparent"
                            : "border-slate-400 text-transparent"
                      }`}>
                        {isSelected && <FiCheckSquare className="h-4 w-4" />}
                      </span>
                      <ProfileAvatar src={item.profilePic} name={item.fullName} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.fullName}</p>
                        <p className={`truncate text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.isOnline ? "Online" : "Recent chat"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className={`shrink-0 border-t p-3 ${isDark ? "border-white/10 bg-[#202020]" : "border-slate-200 bg-slate-50"}`}>
              {selectedForwardUsers.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {selectedForwardUsers.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => toggleForwardUser(item._id)}
                      className={`flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-sm ${isDark ? "bg-white/10 text-slate-100" : "bg-white text-slate-800"}`}
                      title="Remove selected user"
                    >
                      <ProfileAvatar src={item.profilePic} name={item.fullName} className="h-6 w-6 rounded-full object-cover" />
                      <span className="max-w-[120px] truncate">{item.fullName}</span>
                      <FiX className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-3 flex items-end gap-2">
                <div className={`flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl ${isDark ? "bg-black/30" : "bg-white"}`}>
                  {selectedForwardMessages[0]?.image ? (
                    <img src={selectedForwardMessages[0].image} alt="Forward preview" className="h-full w-full object-cover" />
                  ) : selectedForwardMessages[0]?.video ? (
                    <video className="h-full w-full object-cover" muted playsInline>
                      <source src={selectedForwardMessages[0].video} />
                    </video>
                  ) : (
                    <FiShare2 className={`h-7 w-7 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                  )}
                </div>
                <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm ${isDark ? "bg-black/25 text-slate-200" : "bg-white text-slate-700"}`}>
                  <p className="line-clamp-2 font-medium">{getForwardPreview(selectedForwardMessages[0])}</p>
                  {selectedForwardMessages.length > 1 && (
                    <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      +{selectedForwardMessages.length - 1} more message{selectedForwardMessages.length - 1 === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={forwardNote}
                  onChange={(event) => setForwardNote(event.target.value)}
                  className={`h-12 min-w-0 flex-1 rounded-xl px-4 outline-none ${isDark ? "bg-black/25 text-slate-100 placeholder:text-slate-400" : "bg-white text-slate-900 placeholder:text-slate-500"}`}
                  placeholder="Add a message..."
                />
                <button
                  type="button"
                  onClick={sendForwardedMessages}
                  disabled={selectedForwardUsers.length === 0 || isForwardSending}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-xl text-slate-950 shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send forwarded message"
                  title="Send forwarded message"
                >
                  <FiSend />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {!isForwardMode && (
      <form onSubmit={onSend} className={`mt-1 shrink-0 rounded-xl p-1.5 sm:mt-2 sm:p-2 ${isDark ? "border border-white/10 bg-black/40" : "border border-slate-300 bg-white/90"}`}>
        {replyToMessage && (
          <div className={`mb-2 flex items-center gap-2 rounded-xl border-l-2 px-2.5 py-2 text-xs ${isDark ? "border-violet-300 bg-white/10 text-slate-200" : "border-violet-500 bg-slate-100 text-slate-700"}`}>
            <FiCornerUpLeft className="h-4 w-4 shrink-0 text-violet-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{getMessageAuthor(replyToMessage)}</p>
              <p className="truncate opacity-80">{getMessagePreview(replyToMessage)}</p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isDark ? "hover:bg-white/10" : "hover:bg-white"}`}
              title="Cancel reply"
              aria-label="Cancel reply"
            >
              <FiX />
            </button>
          </div>
        )}
        {(image || video) && (
          <div className={`mb-2 flex items-center gap-2 rounded-xl px-2 py-2 text-xs ${isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
            <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              {image ? (
                <img src={image} alt="Selected media" className="h-full w-full object-cover" />
              ) : (
                <video className="h-full w-full object-cover" muted playsInline>
                  <source src={video} />
                </video>
              )}
              <button
                type="button"
                onClick={() => {
                  setMediaError("");
                  setImage("");
                  setVideo("");
                }}
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-white"
                aria-label="Remove selected media"
                title="Remove selected media"
              >
                <FiX />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{video ? "Video attached" : "Image attached"}</p>
              <p className={`${isDark ? "text-slate-400" : "text-slate-500"}`}>You can remove it before sending.</p>
            </div>
          </div>
        )}
        {isVideoUploading && (
          <div className={`mb-2 rounded-xl px-3 py-2 text-xs font-medium ${isDark ? "bg-white/10 text-violet-100" : "bg-violet-50 text-violet-700"}`}>
            Uploading video...
          </div>
        )}
        {!!mediaError && (
          <p className={`mb-2 px-1 text-xs ${isDark ? "text-rose-300" : "text-rose-600"}`}>
            {mediaError}
          </p>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm transition sm:h-10 sm:w-10 sm:rounded-xl sm:text-base ${isDark ? "border border-white/20 text-slate-300 hover:bg-white/10" : "border border-slate-300 text-slate-700 hover:bg-slate-100"}`}
            title="Attach image"
          >
            <FiImage />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setMediaError("");
              try {
                if (file.type.startsWith("video/")) {
                  const maxVideoBytes = MAX_VIDEO_SIZE_MB * 1024 * 1024;
                  if (file.size > maxVideoBytes) {
                    const message = `Video ${MAX_VIDEO_SIZE_MB}MB or smaller upload karo.`;
                    setMediaError(message);
                    toast.error(message);
                    setImage("");
                    setVideo("");
                    e.target.value = "";
                    return;
                  }

                  setImage("");
                  setVideo("");
                  setIsVideoUploading(true);
                  const videoUrl = await uploadVideoToCloudinary(file);
                  setMediaError("");
                  setVideo(videoUrl);
                  toast.success("Video attached");
                  return;
                }

                const compressedImage = await processImageFile(file, {
                  maxWidth: 1280,
                  maxHeight: 1280,
                  quality: 0.72,
                });
                setMediaError("");
                setImage(compressedImage);
                setVideo("");
              } catch (error) {
                const message = error?.response?.data?.message || error?.message || "Media upload failed";
                setMediaError(message);
                toast.error(message);
              } finally {
                setIsVideoUploading(false);
                e.target.value = "";
              }
            }}
          />
          <input
            ref={textInputRef}
            className={`h-8 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none transition focus:border-violet-400 sm:h-10 sm:rounded-xl ${
              isDark
                ? "border border-white/20 bg-transparent text-slate-100 placeholder:text-slate-400"
                : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
            }`}
            value={text}
            onChange={(e) => (onTextChange ? onTextChange(e.target.value) : setText(e.target.value))}
            placeholder="Type a message..."
          />
          <button
            disabled={isVideoUploading}
            className="inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:min-w-[88px] sm:gap-2 sm:rounded-xl sm:px-4"
          >
            <FiSend />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </form>
      )}
    </main>
  );
}
