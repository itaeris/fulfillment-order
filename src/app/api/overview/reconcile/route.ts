import { NextResponse } from "next/server";
import { Order, Platform } from "@/types/order";
import { getTikTokConfig, fetchTikTokOrdersByNumbers } from "@/lib/tiktok-api";
import { getShopeeConfig, fetchShopeeOrdersByNumbers } from "@/lib/shopee-api";
import { fetchJubelioOrdersMatching } from "@/lib/jubelio-api";
import { mergeImportedWithApi, uniqueLookupNumbers } from "@/lib/overview-merge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOOKUP = 400;

type ReconcileSource = "tiktok" | "shopee" | "jubelio";

function publicError(platform: ReconcileSource, error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (platform === "tiktok") {
    if (/belum lengkap|TIKTOK_/i.test(message)) return "TikTok belum terhubung di server. Hubungi IT.";
    if (/timeout|timed out|504/i.test(message)) return "Pengambilan data TikTok terlalu lama. Pakai data Excel dulu.";
    if (/401|unauthorized|token/i.test(message)) return "Gagal masuk ke TikTok. Hubungkan ulang toko.";
    return "Gagal mencocokkan data TikTok. Pakai data Excel dulu.";
  }
  if (platform === "shopee") {
    if (/belum|SHOPEE_|shop_id/i.test(message)) return "Shopee belum terhubung di server. Hubungkan toko di Settings.";
    if (/timeout|timed out|504/i.test(message)) return "Pengambilan data Shopee terlalu lama. Pakai data Excel dulu.";
    if (/401|unauthorized|token|error_auth/i.test(message)) return "Gagal masuk ke Shopee. Hubungkan ulang toko.";
    return "Gagal mencocokkan data Shopee. Pakai data Excel dulu.";
  }
  if (/belum di-set|JUBELIO_EMAIL|JUBELIO_PASSWORD/i.test(message)) {
    return "Jubelio belum terhubung di server. Hubungi IT.";
  }
  if (/timeout|timed out|504/i.test(message)) {
    return "Pengambilan data Jubelio terlalu lama. Pakai data Excel dulu.";
  }
  if (/401|unauthorized|login|password|credential/i.test(message)) {
    return "Gagal masuk ke Jubelio. Hubungi IT.";
  }
  return "Gagal mencocokkan data Jubelio. Pakai data Excel dulu.";
}

function orderToInput(order: Order) {
  return {
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : undefined,
    paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
    mustShipBefore: order.mustShipBefore
      ? new Date(order.mustShipBefore).toISOString()
      : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    platform?: Platform;
    orders?: Order[];
  };
  const platform = body.platform;
  const imported = Array.isArray(body.orders) ? body.orders : [];

  if (!platform || imported.length === 0) {
    return NextResponse.json({ error: "Data unggahan kosong." }, { status: 400 });
  }

  const source: ReconcileSource =
    platform === "jubelio" ? "jubelio" : platform === "shopee" ? "shopee" : "tiktok";
  const numbers =
    source === "jubelio"
      ? uniqueLookupNumbers(imported).slice(0, MAX_LOOKUP)
      : Array.from(
          new Set(imported.map((order) => String(order.orderNumber || "").trim()).filter(Boolean))
        ).slice(0, MAX_LOOKUP);

  try {
    const apiOrders =
      source === "tiktok"
        ? await fetchTikTokOrdersByNumbers(await getTikTokConfig(), numbers)
        : source === "shopee"
          ? await fetchShopeeOrdersByNumbers(await getShopeeConfig(), numbers)
          : await fetchJubelioOrdersMatching(numbers);

    const merged = mergeImportedWithApi(imported, apiOrders);
    return NextResponse.json({
      success: true,
      persist: false,
      importedCount: imported.length,
      apiCount: apiOrders.length,
      matched: merged.matched,
      orders: merged.orders.map(orderToInput),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        persist: false,
        importedCount: imported.length,
        apiCount: 0,
        matched: 0,
        orders: imported.map(orderToInput),
        error: publicError(source, error),
      },
      { status: 200 }
    );
  }
}
