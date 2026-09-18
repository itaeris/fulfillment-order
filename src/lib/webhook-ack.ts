const ACK_WAIT_MS = 2_500;

/**
 * Webhook harus 200 cepat. Jangan biarkan Supabase timeout jadi 5xx
 * (Jubelio/Shopee/TikTok akan retry dan spike makin parah).
 */
export async function finishWebhook(work: Promise<unknown>) {
  const handled = Promise.resolve(work).catch((error) => {
    console.error("webhook background work failed:", error);
  });

  try {
    const mod = await import("@vercel/functions");
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(handled);
      return;
    }
  } catch {
    // Local / tanpa paket @vercel/functions.
  }

  await Promise.race([
    handled,
    new Promise<void>((resolve) => setTimeout(resolve, ACK_WAIT_MS)),
  ]);
}
