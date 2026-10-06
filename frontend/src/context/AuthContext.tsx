import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken } from "../api/client";

interface AuthContextValue {
  isAuthenticated: boolean;
  accountExists: boolean | null; // null while loading
  loading: boolean;
  login: (password: string) => Promise<void>;
  setup: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("focusflow_token"));
  const [accountExists, setAccountExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .authStatus()
      .then((s) => setAccountExists(s.initialized))
      .catch(() => setAccountExists(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(password: string) {
    const res = await api.login(password);
    setToken(res.access_token);
    setIsAuthenticated(true);
  }

  async function setup(password: string) {
    const res = await api.setup(password);
    setToken(res.access_token);
    setIsAuthenticated(true);
    setAccountExists(true);
  }

  function logout() {
    setToken(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, accountExists, loading, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
