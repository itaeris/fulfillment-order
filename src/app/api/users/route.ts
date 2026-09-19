import { NextRequest, NextResponse } from "next/server";
import { findProfileById, getRequestUser } from "@/lib/auth-session";
import { sqlQuery } from "@/lib/sql";

async function requireAdmin() {
  const user = await getRequestUser();
  const profile = user ? await findProfileById(user.id) : null;
  return profile?.role === "admin" ? profile : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sqlQuery<{ id: string; username: string; name: string; email: string; role: string; approved: unknown; created_at: string }[]>(
    "SELECT id, username, name, email, role, approved, created_at FROM users ORDER BY created_at ASC"
  );
  return NextResponse.json({
    users: rows.map((row) => ({ ...row, approved: Boolean(row.approved) })),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    username?: string;
    role?: string;
  };
  const targetId = String(body.id || user.id);
  const admin = await findProfileById(user.id);
  if (targetId !== user.id && admin?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (body.role && admin?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await sqlQuery(
    "UPDATE users SET name = COALESCE(?, name), username = COALESCE(?, username), role = COALESCE(?, role) WHERE id = ?",
    [body.name || null, body.username || null, body.role || null, targetId]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id || id === admin.id) return NextResponse.json({ error: "Tidak bisa hapus akun ini" }, { status: 400 });
  await sqlQuery("DELETE FROM users WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
