"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export type TurnstileHandle = {
  reset: () => void;
};

export const Turnstile = forwardRef<
  TurnstileHandle | null,
  {
    onToken: (token: string) => void;
  }
>(function Turnstile({ onToken }, ref) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const mount = useCallback(() => {
    if (!siteKey || !hostRef.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(hostRef.current, {
      sitekey: siteKey,
      theme: "light",
      size: "flexible",
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
      "error-callback": () => onTokenRef.current(""),
    });
  }, [siteKey]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
      }
      onTokenRef.current("");
    },
  }));

  useEffect(() => {
    mount();
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [mount]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={mount}
      />
      <div ref={hostRef} className="min-h-[65px]" />
    </>
  );
});

Turnstile.displayName = "Turnstile";

export async function verifyTurnstileClient(token: string): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null;
  if (!token) return "Selesaikan verifikasi Cloudflare dulu";

  try {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      return data.error || "Verifikasi gagal. Coba lagi.";
    }
    return null;
  } catch {
    return "Verifikasi gagal. Cek koneksi lalu coba lagi.";
  }
}
