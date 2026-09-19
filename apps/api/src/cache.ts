import { gzipSync, gunzipSync } from "zlib";
import Redis from "ioredis";

const KEY = "fti:dashboard:v1";
const CHUNK = 3000;
const FRESH_SEC = Number(process.env.DASHBOARD_CACHE_TTL || 45);
const STALE_SEC = FRESH_SEC * 8;

export type DashboardPayload = { orders: unknown[]; files: unknown[] };

type MemoryHit = { at: number; data: DashboardPayload };

let memory: MemoryHit | null = null;
let redis: Redis | null | undefined;

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

function redisHost() {
  return String(process.env.REDIS_HOST || "").trim();
}

function getRedis(): Redis | null {
  const host = redisHost();
  if (!host) return null;
  if (redis === undefined) {
    redis = new Redis({
      host,
      port: Number(process.env.REDIS_PORT || 6379),
      password: String(process.env.REDIS_PASSWORD || "") || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    redis.on("error", () => {
      /* container down — memory tetap dipakai */
    });
  }
  return redis;
}

export function redisMode() {
  return redisHost() ? "redis" : "memory";
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
  const client = getRedis();
  if (!client) return null;
  try {
    if (client.status === "wait") await client.connect();
    const metaRaw = await client.get(`${KEY}:meta`);
    if (!metaRaw) return null;
    const meta = unpack<{ files: unknown[]; chunks: number }>(metaRaw);
    if (!meta.chunks) return { orders: [], files: meta.files || [] };
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${KEY}:o:${i}`);
    const parts = await client.mget(...keys);
    const orders: unknown[] = [];
    for (const part of parts) {
      if (!part) return null;
      orders.push(...unpack<unknown[]>(part));
    }
    return { orders, files: meta.files || [] };
  } catch {
    return null;
  }
}

async function redisSet(data: DashboardPayload) {
  const client = getRedis();
  if (!client) return;
  const chunks: string[] = [];
  for (let i = 0; i < data.orders.length; i += CHUNK) {
    chunks.push(pack(data.orders.slice(i, i + CHUNK)));
  }
  const meta = pack({ files: data.files, chunks: chunks.length });
  try {
    if (client.status === "wait") await client.connect();
    const ttl = STALE_SEC;
    const pipe = client.multi();
    pipe.set(`${KEY}:meta`, meta, "EX", ttl);
    chunks.forEach((chunk, i) => pipe.set(`${KEY}:o:${i}`, chunk, "EX", ttl));
    await pipe.exec();
  } catch {
    /* payload terlalu besar / Redis down — memory tetap dipakai */
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
