import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { sqlQuery } from "./sql";

const COOKIE = "fo_session";
const DAY = 24 * 60 * 60;

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthProfile = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "admin" | "warehouse";
  approved: boolean;
};

function secret() {
  return String(process.env.SESSION_SECRET || "fulfillment-local-session");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(user: AuthUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + DAY * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token?: string | null): AuthUser | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = sign(body);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthUser & { exp?: number };
    if (!parsed?.id || !parsed.exp || parsed.exp < Date.now()) return null;
    return { id: parsed.id, email: parsed.email };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAY,
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function getRequestUser() {
  const token = cookies().get(COOKIE)?.value;
  return readSessionToken(token);
}

export async function findProfileByLogin(emailOrUsername: string) {
  const value = emailOrUsername.trim();
  const rows = value.includes("@")
    ? await sqlQuery<AuthProfile[]>("SELECT * FROM users WHERE email = ? LIMIT 1", [value.toLowerCase()])
    : await sqlQuery<AuthProfile[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [value]);
  return rows[0] ? { ...rows[0], approved: Boolean(rows[0].approved) } : null;
}

export async function findProfileById(id: string) {
  const rows = await sqlQuery<AuthProfile[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? { ...rows[0], approved: Boolean(rows[0].approved) } : null;
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function newUserId() {
  return randomUUID();
}
