import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, hashPassword } from "@/lib/auth-session";
import { sqlQuery } from "@/lib/sql";

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = String(body.password || "");
  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }
  await sqlQuery("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(password), user.id]);
  return NextResponse.json({ ok: true });
}
