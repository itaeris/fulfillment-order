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
      return true;
    }

    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    return false;
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user.email!);
      }
      setIsLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const email = session.user.email || "";
        const domain = email.split("@")[1]?.toLowerCase();

        if (domain && !ALLOWED_DOMAINS.includes(domain)) {
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          return;
        }

        setUser(session.user);
        await fetchProfile(session.user.id, email);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
        if (error.message.includes("Invalid login")) {
          return { error: "Email/username atau password salah" };
        }
        return { error: error.message };
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

    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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

      return { error: error?.message || null };
    },
    []
  );

  const updatePassword = useCallback(
    async (password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error?.message || null };
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
