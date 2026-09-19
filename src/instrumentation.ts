export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { ensureSchema } = await import("./lib/schema");
    await ensureSchema();
    console.log("db migrate: ok");
  } catch (error) {
    console.error("db migrate:", error instanceof Error ? error.message : error);
  }
}
