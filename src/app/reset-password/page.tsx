"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type Mode = "request" | "update" | "done";

export default function ResetPasswordPage() {
  const { resetPassword, updatePassword } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("request");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
      }
    });

    if (window.location.hash.includes("type=recovery")) {
      setMode("update");
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!emailOrUsername) {
      setError("Email atau username wajib diisi");
      return;
    }

    setIsSubmitting(true);
    const { error: resetError } = await resetPassword(emailOrUsername);
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError);
    } else {
      setMode("done");
    }
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Semua field wajib diisi");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password tidak cocok");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await updatePassword(newPassword);
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError);
    } else {
      router.replace("/");
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShoppingBag className="w-8 h-8 text-cream-100" />
          </div>
          <h1 className="text-2xl font-bold text-brand-800">Reset Password</h1>
          <p className="text-brand-400 mt-1 text-sm">
            {mode === "request" && "Masukkan email atau username untuk reset"}
            {mode === "update" && "Buat password baru"}
            {mode === "done" && "Link reset sudah dikirim"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-8">
          {/* Request Reset Form */}
          {mode === "request" && (
            <form onSubmit={handleRequestReset} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="emailOrUsername"
                  className="block text-sm font-medium text-brand-700 mb-1.5"
                >
                  Email atau Username
                </label>
                <input
                  id="emailOrUsername"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="email@contoh.com atau username"
                  className="w-full px-4 py-3 border border-brand-200 rounded-xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? "Mengirim..." : "Kirim Link Reset"}
              </button>
            </form>
          )}

          {/* Update Password Form */}
          {mode === "update" && (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-brand-700 mb-1.5"
                >
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-4 py-3 pr-12 border border-brand-200 rounded-xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-300 hover:text-brand-500"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-brand-700 mb-1.5"
                >
                  Konfirmasi Password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="w-full px-4 py-3 border border-brand-200 rounded-xl text-sm text-brand-800 placeholder:text-brand-300 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Password Baru"}
              </button>
            </form>
          )}

          {/* Success State */}
          {mode === "done" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-brand-700 text-sm mb-1 font-medium">
                Link reset password sudah dikirim!
              </p>
              <p className="text-brand-400 text-xs">
                Cek inbox email kamu dan klik link untuk membuat password baru.
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
