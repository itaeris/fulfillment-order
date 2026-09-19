"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <p className="text-brand-400 text-sm">Mengalihkan ke login...</p>
    </div>
  );
}
