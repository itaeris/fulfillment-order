"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="loader" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShoppingBag className="w-8 h-8 text-cream-100" />
          </div>
          <h1 className="text-2xl font-bold text-brand-800">Order Dashboard</h1>
          <p className="text-brand-400 mt-1 text-sm">
            Masuk untuk mengakses dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="identifier"
                className="block text-sm font-medium text-brand-700 mb-1.5"
              >
                Email atau Username
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="email@contoh.com atau username"
                autoComplete="username"
                className="w-full px-4 py-3 border border-brand-200 rounded-xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-brand-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 border border-brand-200 rounded-xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-300 hover:text-brand-500 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? "Memproses..." : "Masuk"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-brand-200" />
            <span className="text-xs text-brand-300">atau</span>
            <div className="flex-1 h-px bg-brand-200" />
          </div>

          {/* Google Sign In */}
          <button
            onClick={async () => {
              setIsGoogleLoading(true);
              setError("");
              const { error: gError } = await signInWithGoogle();
              if (gError) {
                setError(gError);
                setIsGoogleLoading(false);
              }
            }}
            disabled={isGoogleLoading}
            className="w-full py-3 bg-white border border-brand-200 rounded-xl font-medium text-sm text-brand-700 hover:bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isGoogleLoading ? "Mengalihkan..." : "Masuk dengan Google"}
          </button>

          <div className="mt-4 text-center">
            <a
              href="/reset-password"
              className="text-sm text-brand-500 hover:text-brand-700 transition-colors"
            >
              Lupa password?
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-brand-300 mt-6">
          Aeris Beaute &mdash; Fulfillment Dashboard
        </p>
      </div>
    </div>
  );
}
