import { NextResponse } from "next/server";
import { findProfileById, getRequestUser } from "@/lib/auth-session";

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ user: null, profile: null });
  const profile = await findProfileById(user.id);
  if (!profile?.approved) return NextResponse.json({ user: null, profile: null });
  return NextResponse.json({ user, profile });
}
