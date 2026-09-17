import { gzipSync, gunzipSync } from "zlib";
import { Redis as Upstash } from "@upstash/redis";

const KEY = "fti:dashboard:v1";
const CHUNK = 3000;
const FRESH_SEC = Number(process.env.DASHBOARD_CACHE_TTL || 45);
const STALE_SEC = FRESH_SEC * 8;

export type DashboardPayload = { orders: unknown[]; files: unknown[] };

type MemoryHit = { at: number; data: DashboardPayload };

let memory: MemoryHit | null = null;
let upstash: Upstash | null | undefined;

function freshMs() {
  return FRESH_SEC * 1000;
}

function staleMs() {
  return STALE_SEC * 1000;
}

function pack(value: unknown) {
  return gzipSync(Buffer.from(JSON.stringify(value)), { level: 6 }).toString("base64");
}

function unpack<T>(raw: string): T {
  return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as T;
}

function getUpstash(): Upstash | null {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  if (upstash === undefined) {
    upstash = new Upstash({ url, token });
  }
  return upstash;
}

export function redisMode() {
  return getUpstash() ? "upstash" : "memory";
}

export function readMemory(): { data: DashboardPayload; stale: boolean } | null {
  if (!memory) return null;
  const age = Date.now() - memory.at;
  if (age <= freshMs()) return { data: memory.data, stale: false };
  if (age <= staleMs()) return { data: memory.data, stale: true };
  return null;
}

export function writeMemory(data: DashboardPayload) {
  memory = { at: Date.now(), data };
}

export function clearMemory() {
  memory = null;
}

async function redisGet(): Promise<DashboardPayload | null> {
  const rest = getUpstash();
  if (!rest) return null;
  try {
    const metaRaw = await rest.get<string>(`${KEY}:meta`);
    if (!metaRaw || typeof metaRaw !== "string") return null;
    const meta = unpack<{ files: unknown[]; chunks: number }>(metaRaw);
    if (!meta.chunks) return { orders: [], files: meta.files || [] };
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${KEY}:o:${i}`);
    const parts = (await rest.mget(...keys)) as (string | null)[];
    const orders: unknown[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "string") return null;
      orders.push(...unpack<unknown[]>(part));
    }
    return { orders, files: meta.files || [] };
  } catch {
    return null;
  }
}

async function redisSet(data: DashboardPayload) {
  const rest = getUpstash();
  if (!rest) return;
  const chunks: string[] = [];
  for (let i = 0; i < data.orders.length; i += CHUNK) {
    chunks.push(pack(data.orders.slice(i, i + CHUNK)));
  }
  const meta = pack({ files: data.files, chunks: chunks.length });
  const ttl = STALE_SEC;
  try {
    await rest.set(`${KEY}:meta`, meta, { ex: ttl });
    await Promise.all(chunks.map((chunk, i) => rest.set(`${KEY}:o:${i}`, chunk, { ex: ttl })));
  } catch {
    /* payload terlalu besar / Upstash down — memory tetap dipakai */
  }
}

export async function getDashboardCache(): Promise<{ data: DashboardPayload; stale: boolean } | null> {
  const mem = readMemory();
  if (mem && !mem.stale) return mem;

  const remote = await redisGet();
  if (remote) {
    writeMemory(remote);
    return { data: remote, stale: false };
  }

  if (mem) return mem;
  return null;
}

export async function setDashboardCache(data: DashboardPayload) {
  writeMemory(data);
  await redisSet(data);
}
