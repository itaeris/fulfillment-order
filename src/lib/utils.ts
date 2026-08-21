import { Order, OrderSummary, DailyStats, Platform } from "@/types/order";
import { format, parseISO, startOfDay } from "date-fns";
import { id } from "date-fns/locale";

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("id-ID").format(num);
}

/**
 * Excel often formats 40 as "40.000". An older parser stripped every dot,
 * turning qty into 40000 and totals into billions. Undo that when weight
 * makes the inflated qty impossible, and fill unit price from total.
 */
export function sanitizeOrderMetrics(order: Order): Order {
  let quantity = Number(order.quantity) || 0;
  let price = Number(order.price) || 0;
  let totalAmount = Number(order.totalAmount) || 0;
  const weight = Number(order.weight) || 0;
  let originalPrice = order.originalPrice != null ? Number(order.originalPrice) : undefined;

  const inflated = () => {
    if (quantity < 1000 || quantity % 1000 !== 0) return false;
    if (weight > 0 && weight / quantity < 0.05) return true;
    return false;
  };

  while (inflated()) {
    quantity /= 1000;
    if (totalAmount >= 1000 && totalAmount % 1000 === 0) totalAmount /= 1000;
  }

  if (quantity <= 0) quantity = 1;
  if ((!price || price === 0) && totalAmount > 0) {
    price = totalAmount / quantity;
  }
  if ((!originalPrice || originalPrice === 0) && price) {
    originalPrice = price;
  }

  if (
    quantity === order.quantity &&
    price === order.price &&
    totalAmount === order.totalAmount &&
    originalPrice === order.originalPrice
  ) {
    return order;
  }

  return { ...order, quantity, price, originalPrice, totalAmount };
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd MMM yyyy", { locale: id });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd MMM yyyy HH:mm", { locale: id });
}

export function calculateSummary(orders: Order[]): OrderSummary {
  const summary: OrderSummary = {
    totalOrders: orders.length,
    totalRevenue: 0,
    totalItems: 0,
    byPlatform: {
      shopee: { orders: 0, revenue: 0 },
      tiktok: { orders: 0, revenue: 0 },
      tokopedia: { orders: 0, revenue: 0 },
      jubelio: { orders: 0, revenue: 0 },
    },
    byStatus: {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
    },
  };

  for (const order of orders) {
    summary.totalRevenue += order.totalAmount;
    summary.totalItems += order.quantity;
    summary.byPlatform[order.platform].orders += 1;
    summary.byPlatform[order.platform].revenue += order.totalAmount;
    summary.byStatus[order.status] += 1;
  }

  return summary;
}

export function calculateDailyStats(orders: Order[]): DailyStats[] {
  const statsMap = new Map<string, DailyStats>();

  for (const order of orders) {
    const dateKey = format(startOfDay(order.orderDate), "yyyy-MM-dd");
    
    if (!statsMap.has(dateKey)) {
      statsMap.set(dateKey, {
        date: dateKey,
        shopee: 0,
        tiktok: 0,
        tokopedia: 0,
        jubelio: 0,
        total: 0,
      });
    }

    const stats = statsMap.get(dateKey)!;
    // Combine TikTok and Tokopedia into tiktok field
    if (order.platform === "tokopedia") {
      stats.tiktok += order.totalAmount;
    } else {
      stats[order.platform] += order.totalAmount;
    }
    stats.total += order.totalAmount;
  }

  return Array.from(statsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

export function getPlatformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    shopee: "#ee4d2d",
    tiktok: "#00f2ea",
    tokopedia: "#03ac0e",
    jubelio: "#2563eb",
  };
  return colors[platform];
}

export function getPlatformBgColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    shopee: "bg-shopee-50",
    tiktok: "bg-tiktok-50",
    tokopedia: "bg-tokopedia-50",
    jubelio: "bg-blue-50",
  };
  return colors[platform];
}

export function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    shopee: "Shopee",
    tiktok: "TikTok & Tokopedia",
    tokopedia: "TikTok & Tokopedia",
    jubelio: "Jubelio",
  };
  return names[platform];
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-orange-100 text-orange-800",
    shipped: "bg-blue-100 text-blue-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    returned: "bg-stone-100 text-stone-800",
  };
  return colors[status] || "bg-stone-100 text-stone-800";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Belum Bayar",
    processing: "Perlu Dikirim",
    shipped: "Dikirim",
    delivered: "Selesai",
    cancelled: "Dibatalkan",
    returned: "Retur",
  };
  return labels[status] || status;
}
