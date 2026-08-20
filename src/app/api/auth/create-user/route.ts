import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toIndonesianError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { email, password, username, name, role } = await req.json();

    if (!email || !password || !username || !name) {
      return NextResponse.json(
        { error: "Semua field wajib diisi" },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Service role key belum dikonfigurasi" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, name, role: role || "warehouse", approved: true },
    });

    if (error) {
      return NextResponse.json(
        { error: toIndonesianError(error.message, "Gagal membuat user") },
        { status: 400 }
      );
    }

    if (data.user) {
      await supabaseAdmin
        .from("profiles")
        .update({ role: role || "warehouse", username, name, approved: true })
        .eq("id", data.user.id);
    }

    return NextResponse.json({ user: { id: data.user.id, email } });
  } catch (err: any) {
    return NextResponse.json(
      { error: toIndonesianError(err.message, "Terjadi kesalahan pada sistem") },
      { status: 500 }
    );
  }
}
