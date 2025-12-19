import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, registerUser } from './api';

type User = { id: number; username: string; region?: string } | null;

interface AuthContextValue {
  user: User;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string, region?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [token, setToken] = useState<string | null>(() => (typeof window !== 'undefined' ? localStorage.getItem('km_token') : null));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      try {
        const parsed = JSON.parse(atob(token.split('.')[1] || ''));
        setUser({ id: parsed.sub, username: parsed.username, region: parsed.region });
      } catch (e) {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const login = async (username: string, password: string) => {
    setLoading(true);
    const res = await loginUser(username, password);
    setLoading(false);
    if (res.error || !res.data) return { ok: false, error: res.error || 'Login failed' };
    const { token: t } = res.data as any;
    if (typeof window !== 'undefined') localStorage.setItem('km_token', t);
    setToken(t);
    return { ok: true };
  };

  const register = async (username: string, password: string, region?: string) => {
    setLoading(true);
    const res = await registerUser(username, password, region);
    setLoading(false);
    if (res.error || !res.data) return { ok: false, error: res.error || 'Register failed' };
    const { token: t } = res.data as any;
    if (typeof window !== 'undefined') localStorage.setItem('km_token', t);
    setToken(t);
    return { ok: true };
  };

  const logout = () => {
    if (typeof window !== 'undefined') localStorage.removeItem('km_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
