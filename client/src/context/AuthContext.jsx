import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("chat_token");

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

  async function signup(payload) {
    const { data } = await api.post("/auth/signup", payload);
    return data;
  }

  async function verifySignupOtp(payload) {
    const { data } = await api.post("/auth/signup/verify", payload);
    localStorage.setItem("chat_token", data.data.token);
    setUser(data.data.user);
    return data;
  }

  async function login(payload) {
    const { data } = await api.post("/auth/login", payload);
    localStorage.setItem("chat_token", data.data.token);
    setUser(data.data.user);
    return data;
  }

  async function googleLogin(credential) {
    const { data } = await api.post("/auth/google", { credential });
    localStorage.setItem("chat_token", data.data.token);
    setUser(data.data.user);
    return data;
  }

  function logout() {
    localStorage.removeItem("chat_token");
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, signup, verifySignupOtp, googleLogin, logout, setUser }),
    [user, loading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
