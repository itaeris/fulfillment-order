import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", "itaeris")
      .single();

    if (existing) {
      return NextResponse.json(
        { message: "Admin user already exists" },
        { status: 200 }
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: "it@aerisbeaute.com",
      password: "@Aerisbeaute123!",
      options: {
        data: {
          username: "itaeris",
          name: "IT Aeris",
          role: "admin",
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", data.user.id);
    }

    return NextResponse.json({
      message: "Admin user created successfully",
      note: "If email confirmation is enabled, run this in Supabase SQL Editor: UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'it@aerisbeaute.com';",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
