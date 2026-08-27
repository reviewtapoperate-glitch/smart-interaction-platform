import { createContext, useContext, useMemo, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("sip_session");
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("sip_token", data.token);
    localStorage.setItem("sip_session", JSON.stringify(data));
    setSession(data);
  }

  async function register(payload) {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("sip_token", data.token);
    localStorage.setItem("sip_session", JSON.stringify(data));
    setSession(data);
  }

  function logout() {
    localStorage.removeItem("sip_token");
    localStorage.removeItem("sip_session");
    setSession(null);
  }

  const value = useMemo(() => ({
    session,
    login,
    register,
    logout,
    isAuthenticated: Boolean(session?.token)
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
