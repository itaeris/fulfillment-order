const ACK_WAIT_MS = 2_500;

/** Webhook harus 200 cepat. Kerja berat dilanjutkan di background. */
export async function finishWebhook(work: Promise<unknown>) {
  const handled = Promise.resolve(work).catch((error) => {
    console.error("webhook background work failed:", error);
  });

  await Promise.race([
    handled,
    new Promise<void>((resolve) => setTimeout(resolve, ACK_WAIT_MS)),
  ]);
}
