"use client";

import { useState, FormEvent, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  GitCompare,
  LayoutDashboard,
  Lock,
  Mail,
  Package,
  Truck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const FEATURES = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Pesanan", icon: Package },
  { label: "Kirim hari ini", icon: Truck },
  { label: "Komparasi", icon: GitCompare },
  { label: "Jadwal", icon: CalendarDays },
] as const;

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo/FTI_Logogram_White.png"
        alt="From This Island"
        className={`w-auto object-contain ${compact ? "h-9" : "h-11 sm:h-12"}`}
      />
      <span className="h-6 w-px bg-white/30" />
      <span className="text-white tracking-[0.18em] text-xs sm:text-sm font-medium uppercase">
        From This Island
      </span>
    </div>
  );
}

function BrandPanel({ compact = false }: { compact?: boolean }) {
  const greeting = useMemo(timeGreeting, []);

  return (
    <div
      className={
        compact
          ? "px-6 pt-10 pb-6"
          : "relative h-full flex flex-col justify-between px-10 xl:px-14 py-10 overflow-hidden"
      }
    >
      <div>
        <BrandMark compact={compact} />
        {!compact ? (
          <p className="mt-2 text-[10px] tracking-[0.28em] text-white/55 uppercase">
            Order Dashboard
          </p>
        ) : null}
      </div>

      <div className={compact ? "mt-8" : "max-w-xl"}>
        <p className="text-[11px] tracking-[0.22em] text-white/70 uppercase">{greeting}</p>
        <h1
          className={`mt-2 text-white leading-[1.15] font-poppins font-semibold ${
            compact ? "text-[2.1rem]" : "text-5xl xl:text-6xl"
          }`}
        >
          Your fulfillment{" "}
          <span className="text-cream-200">workspace.</span>
        </h1>
        {!compact ? (
          <p className="mt-5 text-sm leading-relaxed text-white/70 max-w-md">
            Pesanan Shopee, TikTok, dan Jubelio untuk From This Island dalam satu tempat.
          </p>
        ) : null}

        <div className={`flex flex-wrap gap-2 ${compact ? "mt-5" : "mt-8"}`}>
          {FEATURES.map(({ label, icon: Icon }) =>
            compact ? (
              <span
                key={label}
                title={label}
                className="w-9 h-9 rounded-full border border-white/20 bg-white/5 text-white/85 inline-flex items-center justify-center"
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
            ) : (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-[11px] text-white/90"
              >
                <Icon className="w-3 h-3" />
                {label}
              </span>
            )
          )}
        </div>
      </div>

      {!compact ? (
        <p className="text-[11px] text-white/45">From This Island</p>
      ) : null}
    </div>
  );
}

function LoginCard({
  identifier,
  setIdentifier,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  isSubmitting,
  isGoogleLoading,
  onSubmit,
  onGoogle,
}: {
  identifier: string;
  setIdentifier: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  error: string;
  isSubmitting: boolean;
  isGoogleLoading: boolean;
  onSubmit: (e: FormEvent) => void;
  onGoogle: () => void;
}) {
  return (
    <div className="w-full">
      <h2 className="text-[1.75rem] sm:text-3xl font-semibold text-brand-800 tracking-tight">
        Welcome back
      </h2>
      <p className="text-sm text-brand-400 mt-1">
        Sign in to continue to Order Dashboard
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        {error ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div>
          <label htmlFor="identifier" className="block text-sm font-semibold text-brand-800 mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@fromthisisland.com"
              autoComplete="username"
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-100 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-brand-800 mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full pl-10 pr-11 py-3 rounded-2xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-100 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-400 hover:text-brand-600"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-1 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5"
        >
          {isSubmitting ? "Memproses..." : "Sign in"}
          {!isSubmitting ? <ChevronRight className="w-4 h-4" /> : null}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-brand-200" />
        <span className="text-[10px] tracking-[0.16em] text-brand-400 uppercase">
          Or continue with
        </span>
        <div className="flex-1 h-px bg-brand-200" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={isGoogleLoading}
        className="w-full py-3 bg-white border border-brand-200 rounded-2xl font-medium text-sm text-brand-800 hover:bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2.5"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {isGoogleLoading ? "Mengalihkan..." : "Sign in with Google"}
      </button>

      <div className="mt-4 text-center">
        <a href="/reset-password" className="text-sm text-brand-500 hover:text-brand-700">
          Lupa password?
        </a>
      </div>

      <p className="lg:hidden text-center text-[11px] text-brand-300 mt-6">
        From This Island
      </p>
    </div>
  );
}

const HERO_BG =
  "linear-gradient(145deg, #5C2E1E 0%, #3D2319 48%, #2C1810 100%)";

export default function LoginPage() {
  const { signIn, signInWithGoogle, user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!identifier || !password) {
      setError("Email/username dan password wajib diisi");
      return;
    }

    setIsSubmitting(true);
    const { error: signInError } = await signIn(identifier, password);
    setIsSubmitting(false);

    if (signInError) {
      setError(signInError);
    } else {
      router.replace("/");
    }
  };

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    setError("");
    const { error: gError } = await signInWithGoogle();
    if (gError) {
      setError(gError);
      setIsGoogleLoading(false);
    }
  };

  const cardProps = {
    identifier,
    setIdentifier,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    isSubmitting,
    isGoogleLoading,
    onSubmit: handleSubmit,
    onGoogle: handleGoogle,
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: HERO_BG }}>
        <div className="loader loader-light" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-dvh">
      <div className="hidden lg:grid lg:grid-cols-2 min-h-dvh">
        <section style={{ background: HERO_BG }}>
          <BrandPanel />
        </section>
        <section className="bg-cream-100 flex items-center justify-center p-8 xl:p-12">
          <div className="w-full max-w-md bg-white rounded-[28px] shadow-[0_20px_50px_rgba(61,35,25,0.08)] p-8 xl:p-10">
            <LoginCard {...cardProps} />
          </div>
        </section>
      </div>

      <div className="lg:hidden min-h-dvh overflow-y-auto flex flex-col" style={{ background: HERO_BG }}>
        <BrandPanel compact />
        <section className="flex-1 bg-white rounded-t-[28px] px-5 pt-3 pb-8">
          <div className="w-10 h-1 rounded-full bg-brand-200 mx-auto mb-5" />
          <LoginCard {...cardProps} />
        </section>
      </div>
    </div>
  );
}
