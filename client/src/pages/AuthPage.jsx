import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { HiMiniChatBubbleBottomCenterText } from "react-icons/hi2";
import { useAuth } from "../context/AuthContext";
import { processImageFile } from "../utils/image";
import { api } from "../services/api";

export default function AuthPage({ mode = "login" }) {
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", bio: "", profilePic: "" });
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState("");
  const [forgotStep, setForgotStep] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [googleRecoveryUser, setGoogleRecoveryUser] = useState(null);
  const [chatPassphrase, setChatPassphrase] = useState("");
  const [confirmChatPassphrase, setConfirmChatPassphrase] = useState("");
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const {
    login,
    signup,
    verifySignupOtp,
    googleLogin,
    requestPasswordReset,
    resetPassword,
    setupEncryptionPassphrase,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const showOtpStep = isSignup && Boolean(otpSentTo);
  const showForgotPassword = Boolean(forgotStep);
  const isGoogleRecoverySetup = googleRecoveryUser && !googleRecoveryUser.encryptionKeyBackup;

  useEffect(() => {
    // Warm up the backend server immediately when AuthPage opens
    api.get("/health").catch(() => {});
  }, []);

  const handleGoogleCredential = useCallback(
    async (credential) => {
      if (!credential) {
        toast.error("Google credential nahi mila");
        return;
      }

      try {
        const result = await googleLogin(credential);
        if (result.data.user.encryptionPassphraseRequired) {
          setGoogleRecoveryUser(result.data.user);
          setChatPassphrase("");
          setConfirmChatPassphrase("");
          toast.success("Google verified");
          return;
        }

        toast.success(isSignup ? "Account created with Google" : "Welcome back");
        navigate("/");
      } catch (error) {
        const message =
          error.response?.data?.message ||
          (error.request ? "Backend server se connection nahi ho pa raha" : "Google authentication failed");
        toast.error(message);
      }
    },
    [googleLogin, isSignup, navigate]
  );

  useEffect(() => {
    if (!googleClientId) return;

    let cancelled = false;
    const scriptId = "google-identity-client";

    function renderGoogleButton() {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
      const buttonWidth = Math.floor(
        Math.min(400, googleButtonRef.current.getBoundingClientRect().width || googleButtonRef.current.parentElement?.clientWidth || 320)
      );

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => handleGoogleCredential(response.credential),
        ux_mode: "popup",
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: isSignup ? "signup_with" : "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: buttonWidth,
      });
      setGoogleButtonReady(true);
    }

    function handleScriptError() {
      if (!cancelled) toast.error("Google sign-in load nahi ho paaya");
    }

    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    let resizeObserver;
    if (window.ResizeObserver && googleButtonRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (googleButtonReady) renderGoogleButton();
      });
      resizeObserver.observe(googleButtonRef.current);
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      script.addEventListener("load", renderGoogleButton);
      script.addEventListener("error", handleScriptError);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      script.removeEventListener("load", renderGoogleButton);
      script.removeEventListener("error", handleScriptError);
    };
  }, [googleButtonReady, googleClientId, handleGoogleCredential, isSignup]);

  async function submit(e) {
    e.preventDefault();
    if (authBusy) return;

    if (showForgotPassword) {
      try {
        setAuthBusy(true);
        if (forgotStep === "email") {
          const data = await requestPasswordReset(forgotEmail);
          setForgotEmail(data.data.email);
          setForgotStep("reset");
          setForgotOtp("");
          setNewPassword("");
          setConfirmNewPassword("");
          toast.success("OTP sent to your email");
          return;
        }

        if (newPassword !== confirmNewPassword) {
          toast.error("New password match nahi ho raha");
          return;
        }

        await resetPassword({ email: forgotEmail, otp: forgotOtp, password: newPassword });
        toast.success("Password reset successfully. Please login.");
        setForgotStep("");
        setForgotEmail("");
        setForgotOtp("");
        setNewPassword("");
        setConfirmNewPassword("");
        setIsSignup(false);
        setForm((prev) => ({ ...prev, email: forgotEmail, password: "" }));
      } catch (error) {
        const message =
          error.response?.data?.message ||
          error.message ||
          (error.request ? "Backend server se connection nahi ho pa raha" : "Password reset failed");
        toast.error(message);
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (googleRecoveryUser) {
      if (isGoogleRecoverySetup && chatPassphrase !== confirmChatPassphrase) {
        toast.error("Chat recovery passphrase match nahi ho raha");
        return;
      }

      try {
        setAuthBusy(true);
        const nextUser = await setupEncryptionPassphrase(chatPassphrase);
        if (nextUser.encryptionRecoveryRequired) {
          toast.error("Create this account's chat key backup from the original browser.");
          return;
        }

        toast.success(isGoogleRecoverySetup ? "Chat recovery passphrase set" : "Encrypted chats unlocked");
        navigate("/");
      } catch (error) {
        toast.error(error.message || "Chat recovery setup failed");
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (showOtpStep) {
      if (chatPassphrase.length < 8) {
        toast.error("Chat recovery passphrase must be at least 8 characters long");
        return;
      }

      if (chatPassphrase !== confirmChatPassphrase) {
        toast.error("Chat recovery passphrase does not match");
        return;
      }

      try {
        setAuthBusy(true);
        const result = await verifySignupOtp({ email: otpSentTo, otp, password: form.password });
        const updatedUser = await setupEncryptionPassphrase(chatPassphrase, result.data.user);
        if (updatedUser.encryptionRecoveryRequired || updatedUser.encryptionPassphraseRequired) {
          toast.error("Create the encrypted chat backup from the original browser.");
          return;
        }

        toast.success("Account verified and chat recovery passphrase set");
        setChatPassphrase("");
        setConfirmChatPassphrase("");
        navigate("/");
      } catch (error) {
        const message =
          error.response?.data?.message ||
          error.message ||
          (error.request ? "Backend server se connection nahi ho pa raha" : "OTP verification failed");
        toast.error(message);
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (isSignup && !acceptTerms) {
      toast.error("Please accept terms and privacy policy");
      return;
    }
    if (isSignup) {
      if (chatPassphrase.length < 8) {
        toast.error("Chat recovery passphrase must be at least 8 characters long");
        return;
      }
      if (chatPassphrase !== confirmChatPassphrase) {
        toast.error("Chat recovery passphrase does not match");
        return;
      }
    }
    try {
      setAuthBusy(true);
      if (isSignup) {
        const data = await signup(form);
        setOtpSentTo(data.data.email);
        setOtp("");
        toast.success("OTP sent to your email");
      } else {
        const result = await login(form);
        toast.success("Welcome back");
        if (result.data.user.encryptionRecoveryRequired) {
          toast.error("Create the encrypted chat backup from the original browser.");
        }
        navigate("/");
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.message ||
        (error.request ? "Backend server se connection nahi ho pa raha" : "Authentication failed");
      toast.error(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendOtp() {
    if (authBusy) return;
    try {
      setAuthBusy(true);
      const data = await signup(form);
      setOtpSentTo(data.data.email);
      setOtp("");
      toast.success("New OTP sent");
    } catch (error) {
      const message =
        error.response?.data?.message ||
        (error.request ? "Backend server se connection nahi ho pa raha" : "Unable to resend OTP");
      toast.error(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendPasswordResetOtp() {
    if (authBusy) return;
    try {
      setAuthBusy(true);
      await requestPasswordReset(forgotEmail);
      setForgotOtp("");
      toast.success("New OTP sent");
    } catch (error) {
      const message =
        error.response?.data?.message ||
        (error.request ? "Backend server se connection nahi ho pa raha" : "Unable to resend OTP");
      toast.error(message);
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen w-full grid-cols-1 overflow-x-hidden bg-[#06070f] text-white md:grid-cols-2">
      {/* Background Deep Purple Ambient Nebula with Slow Dynamic Drift */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[30%] top-[45%] h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/30 blur-[130px] animate-qc-nebula-1 sm:h-[640px] sm:w-[640px]" />
        <div className="absolute left-[70%] top-[65%] h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/20 blur-[120px] animate-qc-nebula-2 sm:h-[480px] sm:w-[480px]" />
        <div className="absolute left-[15%] top-[75%] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-600/20 blur-[120px] animate-qc-nebula-1 sm:h-[420px] sm:w-[420px]" />
      </div>

      {/* Left Column Brand Presentation (Desktop/Tablet) */}
      <section className="relative hidden items-center justify-center p-10 md:flex">
        <div className="relative text-center">
          {/* Logo Cluster with Smooth 3D Levitation & Parallax Motion */}
          <div className="relative mx-auto mb-6 inline-block animate-qc-cluster">
            {/* Pulsing Radial Background Glow */}
            <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-600 opacity-60 blur-2xl animate-qc-glow" />

            {/* Main Gradient Icon */}
            <div className="relative z-10 mx-auto grid h-28 w-28 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_0_55px_rgba(168,85,247,0.5)]">
              <HiMiniChatBubbleBottomCenterText className="text-5xl text-white drop-shadow" />
            </div>

            {/* Top-Right Micro Badge (Lightning) with Micro-Parallax */}
            <div className="absolute -right-3 -top-2 z-20 grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-[#121124]/90 shadow-xl backdrop-blur-md animate-qc-badge-1">
              <span className="text-base text-amber-400">⚡</span>
            </div>

            {/* Bottom-Left Micro Badge (Lock) with Micro-Parallax */}
            <div className="absolute -bottom-2 -left-5 z-20 grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-[#121124]/90 shadow-xl backdrop-blur-md animate-qc-badge-2">
              <span className="text-sm text-amber-300">🔒</span>
            </div>

            {/* Twinkling Star Particle Left of Badge */}
            <div className="absolute -left-9 top-[45%] h-2.5 w-2.5 rounded-full bg-violet-200 blur-[0.5px] shadow-[0_0_10px_#c4b5fd] animate-qc-star" />
          </div>

          <h1 className="text-6xl font-bold tracking-tight text-white">QuickChat</h1>
        </div>
      </section>

      {/* Right Column Form (Mobile & Desktop) */}
      <section className="relative grid min-w-0 place-items-center px-4 py-8 sm:p-6">
        <form
          onSubmit={submit}
          className="w-full min-w-0 max-w-[440px] rounded-3xl border border-white/[0.12] bg-[#0c0d18]/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-8"
        >
          {/* Mobile Header Logo with matching movement and all badges */}
          <div className="mb-6 text-center md:hidden">
            <div className="relative mx-auto mb-3 inline-block animate-qc-cluster">
              {/* Pulsing Radial Background Glow */}
              <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-600 opacity-60 blur-xl animate-qc-glow" />

              {/* Main Gradient Icon */}
              <div className="relative z-10 mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_0_35px_rgba(168,85,247,0.5)]">
                <HiMiniChatBubbleBottomCenterText className="text-4xl text-white drop-shadow" />
              </div>

              {/* Top-Right Micro Badge (Lightning) */}
              <div className="absolute -right-2.5 -top-2 z-20 grid h-8 w-8 place-items-center rounded-xl border border-white/15 bg-[#121124]/90 shadow-xl backdrop-blur-md animate-qc-badge-1">
                <span className="text-sm text-amber-400">⚡</span>
              </div>

              {/* Bottom-Left Micro Badge (Lock) */}
              <div className="absolute -bottom-2 -left-4 z-20 grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-[#121124]/90 shadow-xl backdrop-blur-md animate-qc-badge-2">
                <span className="text-xs text-amber-300">🔒</span>
              </div>

              {/* Twinkling Star Particle Left of Badge */}
              <div className="absolute -left-7 top-[45%] h-2 w-2 rounded-full bg-violet-200 blur-[0.5px] shadow-[0_0_8px_#c4b5fd] animate-qc-star" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white">QuickChat</h1>
          </div>

          <h2 className="mb-6 text-3xl font-bold tracking-tight text-white">
            {showForgotPassword
              ? forgotStep === "email"
                ? "Forgot password"
                : "Reset password"
              : googleRecoveryUser
                ? "Chat recovery"
                : showOtpStep
                  ? "Verify OTP"
                  : isSignup
                    ? "Sign up"
                    : "Login"}
          </h2>

          {showForgotPassword ? (
            <>
              {forgotStep === "email" ? (
                <>
                  <p className="mb-4 text-sm leading-6 text-slate-300">
                    Enter your account email. We will send a 6 digit OTP to reset your password.
                  </p>
                  <input
                    className="mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                    placeholder="Email Address"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm leading-6 text-slate-300">
                    Enter the 6 digit OTP sent to <span className="font-semibold text-white">{forgotEmail}</span>, then create a new password.
                  </p>
                  <input
                    className="mb-3 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <input
                    className="mb-3 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                    placeholder="New Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <input
                    className="mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                    placeholder="Confirm New Password"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </>
              )}
              <button
                className="w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] via-[#A855F7] to-[#D946EF] py-3 text-sm font-semibold text-white shadow-[0_4px_25px_rgba(168,85,247,0.4)] transition duration-200 hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
                disabled={
                  authBusy ||
                  (forgotStep === "email" && !forgotEmail) ||
                  (forgotStep === "reset" && (forgotOtp.length !== 6 || newPassword.length < 6 || confirmNewPassword.length < 6))
                }
              >
                {authBusy ? "Please wait..." : forgotStep === "email" ? "Send OTP" : "Reset Password"}
              </button>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                {forgotStep === "reset" && (
                  <button type="button" className="font-semibold text-violet-300 hover:underline" onClick={resendPasswordResetOtp}>
                    Resend OTP
                  </button>
                )}
                <button
                  type="button"
                  className="font-semibold text-slate-300 hover:text-white"
                  onClick={() => {
                    setForgotStep("");
                    setForgotOtp("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                  }}
                >
                  Back to login
                </button>
              </div>
            </>
          ) : googleRecoveryUser ? (
            <>
              <p className="mb-4 text-sm leading-6 text-slate-300">
                {isGoogleRecoverySetup
                  ? "Set a chat recovery passphrase to open your Google account's encrypted messages on any device."
                  : "Enter your chat recovery passphrase to open previous encrypted messages on this device."}
              </p>
              <input
                className="mb-3 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                placeholder={isGoogleRecoverySetup ? "Create chat recovery passphrase" : "Chat recovery passphrase"}
                type="password"
                value={chatPassphrase}
                onChange={(e) => setChatPassphrase(e.target.value)}
              />
              {isGoogleRecoverySetup && (
                <input
                  className="mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                  placeholder="Confirm chat recovery passphrase"
                  type="password"
                  value={confirmChatPassphrase}
                  onChange={(e) => setConfirmChatPassphrase(e.target.value)}
                />
              )}
              <button
                className="w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] via-[#A855F7] to-[#D946EF] py-3 text-sm font-semibold text-white shadow-[0_4px_25px_rgba(168,85,247,0.4)] transition duration-200 hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
                disabled={authBusy || chatPassphrase.length < 8 || (isGoogleRecoverySetup && confirmChatPassphrase.length < 8)}
              >
                {authBusy ? "Please wait..." : isGoogleRecoverySetup ? "Set & Continue" : "Unlock & Continue"}
              </button>
              <button
                type="button"
                className="mt-4 text-xs font-semibold text-slate-300 hover:text-white"
                onClick={() => {
                  logout();
                  setGoogleRecoveryUser(null);
                  setChatPassphrase("");
                  setConfirmChatPassphrase("");
                }}
              >
                Use another account
              </button>
            </>
          ) : showOtpStep ? (
            <>
              <p className="mb-4 text-sm leading-6 text-slate-300">
                Enter the 6 digit code sent to <span className="font-semibold text-white">{otpSentTo}</span>.
              </p>
              <input
                className="mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </>
          ) : isSignup && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <img
                  src={form.profilePic || "https://placehold.co/64x64?text=DP"}
                  alt="Profile preview"
                  className="h-14 w-14 rounded-full border border-white/30 object-cover"
                />
                <label className="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">
                  Upload photo
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const compressed = await processImageFile(file, {
                          cropSquare: true,
                          maxWidth: 512,
                          maxHeight: 512,
                          quality: 0.75,
                        });
                        setForm((prev) => ({ ...prev, profilePic: compressed }));
                      } catch {
                        toast.error("Unable to process image");
                      }
                    }}
                  />
                </label>
              </div>
              <input
                className="mb-3 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                placeholder="Full Name"
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </>
          )}
          <input
            className={`mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500 ${showForgotPassword || googleRecoveryUser || showOtpStep ? "hidden" : ""}`}
            placeholder="Email Address"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={`mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500 ${showForgotPassword || googleRecoveryUser || showOtpStep ? "hidden" : ""}`}
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {isSignup && !showForgotPassword && !googleRecoveryUser && !showOtpStep && (
            <>
              <p className="mb-3 text-xs leading-5 text-slate-300">
                Set a chat recovery passphrase. You will need it to unlock old encrypted chats on another device.
              </p>
              <input
                className="mb-3 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                placeholder="Chat recovery passphrase"
                type="password"
                value={chatPassphrase}
                onChange={(e) => setChatPassphrase(e.target.value)}
              />
              <input
                className="mb-4 w-full rounded-xl border border-white/10 bg-[#141627]/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-violet-500 focus:bg-[#181a30] focus:ring-1 focus:ring-violet-500"
                placeholder="Confirm chat recovery passphrase"
                type="password"
                value={confirmChatPassphrase}
                onChange={(e) => setConfirmChatPassphrase(e.target.value)}
              />
            </>
          )}
          <button
            className={`w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] via-[#A855F7] to-[#D946EF] py-3 text-sm font-semibold text-white shadow-[0_4px_25px_rgba(168,85,247,0.4)] transition duration-200 hover:opacity-95 active:scale-[0.99] disabled:opacity-50 ${showForgotPassword || googleRecoveryUser ? "hidden" : ""}`}
            disabled={
              authBusy ||
              (showOtpStep && otp.length !== 6) ||
              (!showOtpStep &&
                isSignup &&
                (chatPassphrase.length < 8 || confirmChatPassphrase.length < 8 || chatPassphrase !== confirmChatPassphrase))
            }
          >
            {authBusy ? "Please wait..." : showOtpStep ? "Verify & Create Account" : isSignup ? "Send OTP" : "Login"}
          </button>

          {!showForgotPassword && !googleRecoveryUser && !isSignup && !showOtpStep && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(form.email);
                  setForgotStep("email");
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-200 transition"
              >
                Forgot password?
              </button>
            </div>
          )}

          {!showForgotPassword && !googleRecoveryUser && (showOtpStep ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
              <button type="button" className="font-semibold text-violet-300 hover:underline" onClick={resendOtp}>
                Resend OTP
              </button>
              <button
                type="button"
                className="font-semibold text-slate-300 hover:text-white"
                onClick={() => {
                  setOtpSentTo("");
                  setOtp("");
                }}
              >
                Edit email
              </button>
            </div>
          ) : (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-white/10" />
                <span>or</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {googleClientId ? (
                <div className="google-button-shell min-h-11 w-full min-w-0 overflow-hidden rounded-xl bg-white shadow-md">
                  {!googleButtonReady && <div className="px-4 py-2.5 text-center text-sm text-slate-600">Loading Google...</div>}
                  <div ref={googleButtonRef} className="w-full min-w-0" />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  Google sign-in ke liye VITE_GOOGLE_CLIENT_ID set karo.
                </div>
              )}
            </>
          ))}

          {!showForgotPassword && !googleRecoveryUser && isSignup && !showOtpStep && (
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              Agree to the terms of use & privacy policy.
            </label>
          )}

          <div className="mt-5">
            <button
              type="button"
              onClick={() => {
                setIsSignup((s) => !s);
                setOtpSentTo("");
                setOtp("");
                setChatPassphrase("");
                setConfirmChatPassphrase("");
              }}
              className={`text-xs text-slate-400 ${showForgotPassword || googleRecoveryUser ? "hidden" : ""}`}
            >
              {isSignup ? "Already have an account? " : "New here? "}
              <span className="font-semibold text-violet-400 hover:underline">{isSignup ? "Login here" : "Create account"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
