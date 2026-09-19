"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type UserRole = "admin" | "warehouse";

export type AuthUser = {
  id: string;
  email: string;
};

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
}

const SESSION_KEY = "login_timestamp";
const PROFILE_CACHE_KEY = "fo_profile_v1";

function readProfileCache(userId: string): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed?.id !== userId || !parsed.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfileCache(profile: UserProfile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

function clearProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signIn: (emailOrUsername: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as { user?: AuthUser | null; profile?: UserProfile | null };
        if (cancelled) return;
        if (data.user && data.profile) {
          setUser(data.user);
          setProfile(data.profile);
          writeProfileCache(data.profile);
          if (!localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, Date.now().toString());
        } else {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (emailOrUsername: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      user?: AuthUser;
      profile?: UserProfile;
    };
    if (!res.ok || !data.user || !data.profile) {
      return { error: data.error || "Email/username atau password salah" };
    }
    localStorage.setItem(SESSION_KEY, Date.now().toString());
    writeProfileCache(data.profile);
    setUser(data.user);
    setProfile(data.profile);
    return { error: null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    return { error: "Login Google sudah tidak dipakai. Masuk pakai email/username dan password." };
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    clearProfileCache();
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setProfile(null);
    window.location.replace("/login");
  }, []);

  const resetPassword = useCallback(async () => {
    return { error: "Reset password lewat admin di Settings → Kelola User." };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: data.error || "Gagal mengubah password" };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        signIn,
        signInWithGoogle,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
