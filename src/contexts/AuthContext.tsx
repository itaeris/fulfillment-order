"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { toIndonesianError } from "@/lib/errors";
import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "warehouse";

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
}

const ALLOWED_DOMAINS = ["aerisbeaute.com", "fromthisisland.com"];
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
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
    // ignore quota
  }
}

function clearProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signIn: (
    emailOrUsername: string,
    password: string
  ) => Promise<{ error: string | null }>;
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string, email: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data && !error) {
      if (!data.approved) {
        await supabase.auth.signOut();
        clearProfileCache();
        setUser(null);
        setProfile(null);
        return false;
      }

      setProfile({
        id: data.id,
        username: data.username,
        name: data.name,
        email,
        role: data.role as UserRole,
        approved: data.approved,
      });
      writeProfileCache({
        id: data.id,
        username: data.username,
        name: data.name,
        email,
        role: data.role as UserRole,
        approved: data.approved,
      });
      return true;
    }

    await supabase.auth.signOut();
    clearProfileCache();
    setUser(null);
    setProfile(null);
    return false;
  }, []);

  const checkSessionExpiry = useCallback(async () => {
    const loginTime = localStorage.getItem(SESSION_KEY);
    if (!loginTime) return;

    const elapsed = Date.now() - parseInt(loginTime, 10);
    if (elapsed >= SESSION_DURATION_MS) {
      localStorage.removeItem(SESSION_KEY);
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const profileUserId = { current: null as string | null };
    let cancelled = false;

    const applySession = async (session: { user: User } | null, event?: string) => {
      if (cancelled) return;

      if (!session?.user) {
        profileUserId.current = null;
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED" && profileUserId.current === session.user.id) {
        setUser(session.user);
        return;
      }

      const loginTime = localStorage.getItem(SESSION_KEY);
      if (loginTime) {
        const elapsed = Date.now() - parseInt(loginTime, 10);
        if (elapsed >= SESSION_DURATION_MS) {
          localStorage.removeItem(SESSION_KEY);
          clearProfileCache();
          await supabase.auth.signOut();
          setIsLoading(false);
          return;
        }
      } else {
        localStorage.setItem(SESSION_KEY, Date.now().toString());
      }

      setUser(session.user);
      const cached = readProfileCache(session.user.id);
      if (cached) {
        setProfile(cached);
        profileUserId.current = session.user.id;
        setIsLoading(false);
        void fetchProfile(session.user.id, session.user.email || cached.email);
        return;
      }

      await fetchProfile(session.user.id, session.user.email || "");
      profileUserId.current = session.user.id;
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        clearProfileCache();
        localStorage.removeItem(SESSION_KEY);
      }
      if (session?.user) {
        const email = session.user.email || "";
        const domain = email.split("@")[1]?.toLowerCase();
        if (domain && !ALLOWED_DOMAINS.includes(domain)) {
          clearProfileCache();
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          return;
        }
      }
      await applySession(session, event);
    });

    const expiryInterval = setInterval(checkSessionExpiry, 60 * 1000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearInterval(expiryInterval);
    };
  }, [fetchProfile, checkSessionExpiry]);

  const signIn = useCallback(
    async (
      emailOrUsername: string,
      password: string
    ): Promise<{ error: string | null }> => {
      let email = emailOrUsername.trim();

      if (!email.includes("@")) {
        const { data, error } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", email)
          .single();

        if (error || !data) {
          return { error: "Username tidak ditemukan" };
        }
        email = data.email;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: toIndonesianError(error.message, "Email/username atau password salah") };
      }

      return { error: null };
    },
    []
  );

  const signInWithGoogle = useCallback(async (): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) return { error: toIndonesianError(error.message, "Gagal login dengan Google") };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    clearProfileCache();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.replace("/login");
  }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<{ error: string | null }> => {
      let targetEmail = email.trim();

      if (!targetEmail.includes("@")) {
        const { data, error } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", targetEmail)
          .single();

        if (error || !data) {
          return { error: "Username tidak ditemukan" };
        }
        targetEmail = data.email;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        { redirectTo: `${window.location.origin}/reset-password` }
      );

      return {
        error: error
          ? toIndonesianError(error.message, "Gagal mengirim email reset password")
          : null,
      };
    },
    []
  );

  const updatePassword = useCallback(
    async (password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.updateUser({ password });
      return {
        error: error
          ? toIndonesianError(error.message, "Gagal memperbarui password")
          : null,
      };
    },
    []
  );

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
