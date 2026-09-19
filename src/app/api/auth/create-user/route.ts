import { NextRequest, NextResponse } from "next/server";
import { findProfileById, getRequestUser, hashPassword, newUserId } from "@/lib/auth-session";
import { sqlQuery } from "@/lib/sql";

export async function POST(req: NextRequest) {
  const actor = await getRequestUser();
  const actorProfile = actor ? await findProfileById(actor.id) : null;
  if (actorProfile?.role !== "admin") {
    return NextResponse.json({ error: "Hanya admin yang boleh menambah user" }, { status: 403 });
  }

  const { email, password, username, name, role } = await req.json();
  if (!email || !password || !username || !name) {
    return NextResponse.json({ error: "Semua field wajib diisi" }, { status: 400 });
  }

  const id = newUserId();
  try {
    await sqlQuery(
      `INSERT INTO users (id, username, name, email, password_hash, role, approved)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, String(username).trim(), String(name).trim(), String(email).trim().toLowerCase(), await hashPassword(password), role || "warehouse"]
    );
    return NextResponse.json({ user: { id, email } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat user";
    return NextResponse.json(
      { error: message.includes("Duplicate") ? "Email atau username sudah dipakai" : "Gagal membuat user" },
      { status: 400 }
    );
  }
}
