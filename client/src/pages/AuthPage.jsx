import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { HiMiniChatBubbleBottomCenterText } from "react-icons/hi2";
import { useAuth } from "../context/AuthContext";
import { processImageFile } from "../utils/image";

export default function AuthPage({ mode = "login" }) {
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", bio: "", profilePic: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const { login, signup, googleLogin } = useAuth();
  const navigate = useNavigate();

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
        width: Math.min(382, googleButtonRef.current.offsetWidth || 382),
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

    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      script.addEventListener("load", renderGoogleButton);
      script.addEventListener("error", handleScriptError);
    }

    return () => {
      cancelled = true;
      script.removeEventListener("load", renderGoogleButton);
      script.removeEventListener("error", handleScriptError);
    };
  }, [googleClientId, handleGoogleCredential, isSignup]);

  async function submit(e) {
    e.preventDefault();
    if (isSignup && !acceptTerms) {
      toast.error("Please accept terms and privacy policy");
      return;
    }
    try {
      if (isSignup) {
        await signup(form);
        toast.success("Account created");
        navigate("/");
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
    }
  }

  return (
    <div className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-black text-white md:grid-cols-2">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/40 blur-[90px]" />
        <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-[80px]" />
      </div>

      <section className="relative hidden items-center justify-center p-10 md:flex">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-violet-500/30">
            <HiMiniChatBubbleBottomCenterText className="text-4xl text-white" />
          </div>
          <h1 className="text-6xl font-semibold tracking-tight">QuickChat</h1>
        </div>
      </section>

      <section className="relative grid place-items-center p-4">
        <form
          onSubmit={submit}
          className="w-full max-w-[430px] rounded-xl border border-white/20 bg-black/45 p-6 shadow-2xl backdrop-blur-md"
        >
          <h2 className="mb-5 text-3xl font-semibold">{isSignup ? "Sign up" : "Login"}</h2>

          {isSignup && (
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
            className="mb-3 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400"
            placeholder="Email Address"
            type="email"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="mb-4 w-full rounded-md border border-white/25 bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-violet-400"
            placeholder="Password"
            type="password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button className="w-full rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-medium text-white transition hover:opacity-95">
            {isSignup ? "Create Account" : "Login"}
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-white/15" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/15" />
          </div>

          {googleClientId ? (
            <div className="min-h-10 w-full overflow-hidden rounded-md bg-white">
              {!googleButtonReady && <div className="px-4 py-2 text-center text-sm text-slate-600">Loading Google...</div>}
              <div ref={googleButtonRef} className={googleButtonReady ? "" : "hidden"} />
            </div>
          ) : (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              Google sign-in ke liye VITE_GOOGLE_CLIENT_ID set karo.
            </div>
          )}

          {isSignup && (
            <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              Agree to the terms of use & privacy policy.
            </label>
          )}

          <button
            type="button"
            onClick={() => setIsSignup((s) => !s)}
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
