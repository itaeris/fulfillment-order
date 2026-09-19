import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const cookie = clearSessionCookie();
  res.cookies.set(cookie);
  return res;
}
