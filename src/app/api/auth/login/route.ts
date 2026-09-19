import { NextRequest, NextResponse } from "next/server";
import {
  findProfileByLogin,
  makeSessionToken,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth-session";
import { sqlQuery } from "@/lib/sql";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { emailOrUsername?: string; password?: string };
  const login = String(body.emailOrUsername || "").trim();
  const password = String(body.password || "");
  if (!login || !password) {
    return NextResponse.json({ error: "Email/username dan password wajib diisi" }, { status: 400 });
  }

  const profile = await findProfileByLogin(login);
  if (!profile) return NextResponse.json({ error: "Username tidak ditemukan" }, { status: 401 });
  if (!profile.approved) return NextResponse.json({ error: "Akun belum aktif. Hubungi admin." }, { status: 403 });

  const rows = await sqlQuery<{ password_hash: string }[]>("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [profile.id]);
  const ok = rows[0]?.password_hash ? await verifyPassword(password, rows[0].password_hash) : false;
  if (!ok) return NextResponse.json({ error: "Email/username atau password salah" }, { status: 401 });

  const user = { id: profile.id, email: profile.email };
  const res = NextResponse.json({ user, profile });
  const cookie = sessionCookie(makeSessionToken(user));
  res.cookies.set(cookie);
  return res;
}
