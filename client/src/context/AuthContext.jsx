import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, beginManualLogout, endManualLogout, isManualLogoutInProgress } from "../services/api";
import { ensureRecoverableKeyPair, getLocalKeyPair } from "../utils/e2ee";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutInFlightRef = useRef(false);

  const token = localStorage.getItem("chat_token");

  function needsRecoveryPassphrase(nextUser) {
    if (!nextUser?._id) return false;
    const localKeyPair = getLocalKeyPair(nextUser._id);
    if (!nextUser.publicKey) return true;
    if (!nextUser.encryptionKeyBackup) return true;
    return localKeyPair?.publicKey !== nextUser.publicKey;
  }

  const syncRecoverableEncryptionKey = useCallback(async (nextUser, password) => {
    if (!nextUser?._id || !password) return nextUser;

    let recovery;
    try {
      recovery = await ensureRecoverableKeyPair({
        userId: nextUser._id,
        password,
        publicKey: nextUser.publicKey,
        encryptionKeyBackup: nextUser.encryptionKeyBackup,
      });
    } catch (error) {
      if (error.message === "Encrypted chat key is missing on this device") {
        return { ...nextUser, encryptionRecoveryRequired: true };
      }
      if (error.name === "OperationError") {
        throw new Error("Invalid chat recovery passphrase");
      }
      throw error;
    }

    const { keyPair, encryptionKeyBackup, shouldSync } = recovery;
    if (!shouldSync) return { ...nextUser, encryptionRecoveryRequired: false };

    const { data } = await api.patch("/users/encryption-key", {
      publicKey: keyPair.publicKey,
      encryptionKeyBackup,
    });
    return { ...data.data, encryptionRecoveryRequired: false };
  }, []);

  useEffect(() => {
    function handleSessionReplaced(event) {
      if (isManualLogoutInProgress()) return;
      setUser(null);
      toast.error(event.detail?.message || "This account was logged in on another device.");
    }

    window.addEventListener("quickchat:session-replaced", handleSessionReplaced);
    return () => window.removeEventListener("quickchat:session-replaced", handleSessionReplaced);
  }, []);

  useEffect(() => {
    async function getMe() {
      if (!token) return setLoading(false);
      try {
        const { data } = await api.get("/auth/me");
        setUser({
          ...data.data,
          encryptionPassphraseRequired: needsRecoveryPassphrase(data.data),
          encryptionRecoveryRequired: false,
        });
        endManualLogout();
      } catch {
        localStorage.removeItem("chat_token");
      } finally {
        setLoading(false);
      }
    }
    getMe();
  }, [token]);

  const signup = useCallback(async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    return data;
  }, []);

  const verifySignupOtp = useCallback(async (payload) => {
    const { data } = await api.post("/auth/signup/verify", payload);
    endManualLogout();
    localStorage.setItem("chat_token", data.data.token);
    const nextUser = await syncRecoverableEncryptionKey(data.data.user, payload.password);
    setUser(nextUser);
    return { ...data, data: { ...data.data, user: nextUser } };
  }, [syncRecoverableEncryptionKey]);

  const login = useCallback(async (payload) => {
    const { data } = await api.post("/auth/login", payload);
    endManualLogout();
    localStorage.setItem("chat_token", data.data.token);
    const nextUser = await syncRecoverableEncryptionKey(data.data.user, payload.password);
    setUser(nextUser);
    return { ...data, data: { ...data.data, user: nextUser } };
  }, [syncRecoverableEncryptionKey]);

  const googleLogin = useCallback(async (credential) => {
    const { data } = await api.post("/auth/google", { credential });
    endManualLogout();
    localStorage.setItem("chat_token", data.data.token);
    const nextUser = {
      ...data.data.user,
      encryptionPassphraseRequired: needsRecoveryPassphrase(data.data.user),
      encryptionRecoveryRequired: false,
    };
    setUser(nextUser);
    return { ...data, data: { ...data.data, user: nextUser } };
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const { data } = await api.post("/auth/password/forgot", { email });
    return data;
  }, []);

  const resetPassword = useCallback(async (payload) => {
    const { data } = await api.post("/auth/password/reset", payload);
    return data;
  }, []);

  const setupEncryptionPassphrase = useCallback(async (passphrase) => {
    if (!user?._id) throw new Error("Login first");
    if (!passphrase || passphrase.length < 8) {
      throw new Error("Chat recovery passphrase must be at least 8 characters long");
    }

    const nextUser = await syncRecoverableEncryptionKey(user, passphrase);
    const updatedUser = {
      ...nextUser,
      encryptionPassphraseRequired: Boolean(nextUser.encryptionRecoveryRequired),
    };
    setUser(updatedUser);
    return updatedUser;
  }, [syncRecoverableEncryptionKey, user]);

  const logout = useCallback(async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    beginManualLogout();

    try {
      if (localStorage.getItem("chat_token")) {
        await api.post("/auth/logout", null, { skipSessionReplacedHandler: true });
      }
    } catch {
      // Local logout should still work even if the server is unreachable.
    } finally {
      localStorage.removeItem("chat_token");
      setUser(null);
      logoutInFlightRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      verifySignupOtp,
      googleLogin,
      requestPasswordReset,
      resetPassword,
      setupEncryptionPassphrase,
      logout,
      setUser,
    }),
    [
      user,
      loading,
      login,
      signup,
      verifySignupOtp,
      googleLogin,
      requestPasswordReset,
      resetPassword,
      setupEncryptionPassphrase,
      logout,
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
