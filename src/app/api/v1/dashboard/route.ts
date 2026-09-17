import { NextResponse } from "next/server";
import { getAllOrders, getAllUploadedFiles } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function nestUrl() {
  const raw = String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!raw) return "";
  if (/localhost|127\.0\.0\.1/.test(raw) && process.env.VERCEL) return "";
  return raw;
}

export async function GET() {
  const nest = nestUrl();
  if (nest) {
    try {
      const res = await fetch(`${nest}/v1/dashboard`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallback ke query langsung.
    }
  }

  try {
    const [orders, files] = await Promise.all([getAllOrders(), getAllUploadedFiles()]);
    return NextResponse.json({ orders, files });
  } catch (error) {
    console.error("dashboard-v1:", error);
    return NextResponse.json({ error: "Gagal mengambil data pesanan" }, { status: 500 });
  }
}
