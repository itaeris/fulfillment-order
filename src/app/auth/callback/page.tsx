"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ALLOWED_DOMAINS = ["aerisbeaute.com", "fromthisisland.com"];

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashError = hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setError(decodeURIComponent(hashError));
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (!session?.user?.email) {
        setError("Gagal mendapatkan informasi akun");
        return;
      }

      const domain = session.user.email.split("@")[1]?.toLowerCase();
      if (!ALLOWED_DOMAINS.includes(domain)) {
        await supabase.auth.signOut();
        setError(`Domain @${domain} tidak diizinkan. Hanya @aerisbeaute.com dan @fromthisisland.com yang bisa login.`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", session.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("Akun kamu belum didaftarkan. Hubungi admin untuk mendaftarkan akun terlebih dahulu.");
        return;
      }

      if (!profile.approved) {
        await supabase.auth.signOut();
        setError("Akun kamu belum disetujui. Hubungi admin untuk mengaktifkan akun.");
        return;
      }

      router.replace("/");
    };

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-8">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-brand-800 mb-2">Akses Ditolak</h2>
            <p className="text-sm text-brand-500 mb-6">{error}</p>
            <a
              href="/login"
              className="inline-block px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-all"
            >
              Kembali ke Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="loader" />
        <p className="text-brand-400 text-sm">Memverifikasi akun...</p>
      </div>
    </div>
  );
}
