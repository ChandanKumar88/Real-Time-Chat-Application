import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { processImageFile } from "../utils/image";
import bgImage from "../assets/bgImage.svg";

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [profilePic, setProfilePic] = useState("");
  const [preview, setPreview] = useState(user?.profilePic || "");
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`grid min-h-screen place-items-center p-4 ${isDark ? "bg-black" : "bg-slate-100"}`}>
      <form
        className={`relative w-full max-w-2xl overflow-hidden rounded-xl p-6 shadow-2xl backdrop-blur-md ${
          isDark ? "border border-white/20 bg-black/35" : "border border-slate-300 bg-white/80"
        }`}
        style={{
          backgroundImage: isDark
            ? `linear-gradient(rgba(10,10,18,0.55), rgba(10,10,18,0.7)), url(${bgImage})`
            : `linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.78)), url(${bgImage})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { data } = await api.put("/users/profile", { fullName, bio, profilePic });
            setUser(data.data);
            toast.success("Profile updated");
            navigate("/");
          } catch (error) {
            toast.error(error.response?.data?.message || "Update failed");
          }
        }}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className={`text-lg font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>Profile details</h2>
            <label className={`flex cursor-pointer items-center gap-2 text-sm ${isDark ? "text-slate-200" : "text-slate-700"}`}>
              <img
                src={preview || "https://placehold.co/48x48?text=DP"}
                alt="Profile preview"
                className={`h-9 w-9 rounded-full object-cover ${isDark ? "border border-white/20" : "border border-slate-300"}`}
              />
              <span>upload profile image</span>
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  try {
                    const compressed = await processImageFile(file, {
                      cropSquare: true,
                      maxWidth: 512,
                      maxHeight: 512,
                      quality: 0.75,
                    });
                    setProfilePic(compressed);
                    setPreview(compressed);
                  } catch (_error) {
                    toast.error("Unable to process image");
                  }
                }}
              />
            </label>

            <input
              className={`w-full rounded-md p-2 outline-none placeholder:text-slate-400 focus:border-violet-400 ${
                isDark
                  ? "border border-white/20 bg-black/30 text-slate-100"
                  : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
              }`}
              value={fullName}
              placeholder="your name"
              onChange={(e) => setFullName(e.target.value)}
            />
            <textarea
              className={`h-24 w-full rounded-md p-2 outline-none focus:border-violet-400 ${
                isDark
                  ? "border border-white/20 bg-black/30 text-slate-100 placeholder:text-slate-400"
                  : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
              }`}
              value={bio}
              placeholder="Write profile bio"
              onChange={(e) => setBio(e.target.value)}
            />
            <button className="w-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500 px-3 py-2 font-medium text-white transition hover:opacity-95">
              Save
            </button>
          </div>

          <div className="grid place-items-center">
            <img
              src={preview || "https://placehold.co/180x180?text=Profile"}
              alt="User profile"
              className={`h-44 w-44 rounded-full border-4 object-cover shadow-lg shadow-violet-500/20 ${
                isDark ? "border-white/20" : "border-violet-200"
              }`}
            />
            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm("Are you sure? This will permanently delete your account and chats.");
                if (!confirmed) return;
                try {
                  await api.delete("/users/profile");
                  logout();
                  toast.success("Account deleted");
                  navigate("/signup");
                } catch (error) {
                  toast.error(error.response?.data?.message || "Failed to delete account");
                }
              }}
              className="mt-4 w-44 rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-3 py-2 text-sm font-medium text-white transition hover:opacity-95"
            >
              Delete Account
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
