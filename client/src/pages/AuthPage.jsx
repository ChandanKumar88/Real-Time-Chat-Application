import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { HiMiniChatBubbleBottomCenterText } from "react-icons/hi2";
import { useAuth } from "../context/AuthContext";
import { processImageFile } from "../utils/image";

export default function AuthPage({ mode = "login" }) {
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", bio: "", profilePic: "" });
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const { login, signup, verifySignupOtp, googleLogin } = useAuth();
  const navigate = useNavigate();
  const showOtpStep = isSignup && Boolean(otpSentTo);

  const handleGoogleCredential = useCallback(
    async (credential) => {
      if (!credential) {
        toast.error("Google credential nahi mila");
        return;
      }

      try {
        await googleLogin(credential);
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

    if (showOtpStep) {
      try {
        setAuthBusy(true);
        await verifySignupOtp({ email: otpSentTo, otp });
        toast.success("Account verified");
        navigate("/");
      } catch (error) {
        const message =
          error.response?.data?.message ||
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
    try {
      setAuthBusy(true);
      if (isSignup) {
        const data = await signup(form);
        setOtpSentTo(data.data.email);
        setOtp("");
        toast.success("OTP sent to your email");
      } else {
        await login(form);
        toast.success("Welcome back");
        navigate("/");
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
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

  return (
    <div className="relative grid min-h-screen w-full grid-cols-1 overflow-x-hidden bg-black text-white md:grid-cols-2">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/40 blur-[80px] sm:h-[420px] sm:w-[420px]" />
        <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-[70px] sm:h-[360px] sm:w-[360px]" />
      </div>

      <section className="relative hidden items-center justify-center p-10 md:flex">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-violet-500/30">
            <HiMiniChatBubbleBottomCenterText className="text-4xl text-white" />
          </div>
          <h1 className="text-6xl font-semibold tracking-tight">QuickChat</h1>
        </div>
      </section>

      <section className="relative grid min-w-0 place-items-center px-3 py-8 sm:p-4">
        <form
          onSubmit={submit}
          className="w-full min-w-0 max-w-[430px] rounded-xl border border-white/20 bg-black/45 p-4 shadow-2xl backdrop-blur-md sm:p-6"
        >
          <h2 className="mb-5 text-3xl font-semibold">
            {showOtpStep ? "Verify OTP" : isSignup ? "Sign up" : "Login"}
          </h2>

          {showOtpStep ? (
            <>
              <p className="mb-4 text-sm leading-6 text-slate-300">
                Enter the 6 digit code sent to <span className="font-semibold text-white">{otpSentTo}</span>.
              </p>
              <input
                className="mb-4 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-center text-lg tracking-[0.35em] text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400"
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
                className="mb-3 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400"
                placeholder="Full Name"
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </>
          )}
          <input
            className={`mb-3 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400 ${showOtpStep ? "hidden" : ""}`}
            placeholder="Email Address"
            type="email"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={`mb-4 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400 ${showOtpStep ? "hidden" : ""}`}
            placeholder="Password"
            type="password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button
            className="w-full rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={authBusy || (showOtpStep && otp.length !== 6)}
          >
            {authBusy ? "Please wait..." : showOtpStep ? "Verify & Create Account" : isSignup ? "Send OTP" : "Login"}
          </button>

          {showOtpStep ? (
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
              <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-white/15" />
                <span>or</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>

              {googleClientId ? (
                <div className="google-button-shell min-h-10 w-full min-w-0 overflow-hidden rounded-md bg-white">
                  {!googleButtonReady && <div className="px-4 py-2 text-center text-sm text-slate-600">Loading Google...</div>}
                  <div ref={googleButtonRef} className="w-full min-w-0" />
                </div>
              ) : (
                <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  Google sign-in ke liye VITE_GOOGLE_CLIENT_ID set karo.
                </div>
              )}
            </>
          )}

          {isSignup && !showOtpStep && (
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              Agree to the terms of use & privacy policy.
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              setIsSignup((s) => !s);
              setOtpSentTo("");
              setOtp("");
            }}
            className="mt-4 text-xs text-slate-300"
          >
            {isSignup ? "Already have an account? " : "New here? "}
            <span className="font-semibold text-violet-400 hover:underline">{isSignup ? "Login here" : "Create account"}</span>
          </button>
        </form>
      </section>
    </div>
  );
}
