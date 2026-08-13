"use client";

import { Package, TrendingUp, ShoppingBag, DollarSign } from "lucide-react";
import { OrderSummary } from "@/types/order";
import { cn, formatCurrency, formatNumber, getPlatformName } from "@/lib/utils";

interface SummaryCardsProps {
  summary: OrderSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const mainCards = [
    {
      title: "Total Order",
      value: formatNumber(summary.totalOrders),
      icon: Package,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      title: "Total Pendapatan",
      value: formatCurrency(summary.totalRevenue),
      icon: DollarSign,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      title: "Total Item Terjual",
      value: formatNumber(summary.totalItems),
      icon: ShoppingBag,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      title: "Rata-rata Order",
      value: formatCurrency(
        summary.totalOrders > 0
          ? summary.totalRevenue / summary.totalOrders
          : 0
      ),
      icon: TrendingUp,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
  ];

  // Combine TikTok and Tokopedia data
  const combinedTiktokData = {
    orders: summary.byPlatform.tiktok.orders + summary.byPlatform.tokopedia.orders,
    revenue: summary.byPlatform.tiktok.revenue + summary.byPlatform.tokopedia.revenue,
  };

  const platformCards = [
    {
      platform: "shopee" as const,
      name: "Shopee",
      color: "bg-shopee-500",
      bgColor: "bg-shopee-50",
      borderColor: "border-shopee-200",
      data: summary.byPlatform.shopee,
    },
    {
      platform: "tiktok" as const,
      name: "TikTok & Tokopedia",
      color: "bg-black",
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
      data: combinedTiktokData,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mainCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">
                  {card.title}
                </p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {card.value}
                </p>
              </div>
              <div className={cn("p-3 rounded-xl", card.bgColor)}>
                <card.icon className={cn("w-6 h-6", card.textColor)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platformCards.map((card) => {
          const data = card.data;
          const percentage =
            summary.totalRevenue > 0
              ? (data.revenue / summary.totalRevenue) * 100
              : 0;

          return (
            <div
              key={card.platform}
              className={cn(
                "bg-white rounded-xl shadow-sm border p-5",
                card.borderColor
              )}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("w-3 h-3 rounded-full", card.color)} />
                <h3 className="font-semibold text-slate-800">{card.name}</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Order</span>
                  <span className="font-semibold text-slate-700">
                    {formatNumber(data.orders)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Pendapatan</span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(data.revenue)}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-2">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", card.color)}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {percentage.toFixed(1)}% dari total
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
