import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { ensureRecoverableKeyPair } from "../utils/e2ee";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("chat_token");

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
    async function getMe() {
      if (!token) return setLoading(false);
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.data);
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
    localStorage.setItem("chat_token", data.data.token);
    const nextUser = await syncRecoverableEncryptionKey(data.data.user, payload.password);
    setUser(nextUser);
    return { ...data, data: { ...data.data, user: nextUser } };
  }, [syncRecoverableEncryptionKey]);

  const login = useCallback(async (payload) => {
    const { data } = await api.post("/auth/login", payload);
    localStorage.setItem("chat_token", data.data.token);
    const nextUser = await syncRecoverableEncryptionKey(data.data.user, payload.password);
    setUser(nextUser);
    return { ...data, data: { ...data.data, user: nextUser } };
  }, [syncRecoverableEncryptionKey]);

  const googleLogin = useCallback(async (credential) => {
    const { data } = await api.post("/auth/google", { credential });
    localStorage.setItem("chat_token", data.data.token);
    setUser(data.data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("chat_token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, verifySignupOtp, googleLogin, logout, setUser }),
    [user, loading, login, signup, verifySignupOtp, googleLogin, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
