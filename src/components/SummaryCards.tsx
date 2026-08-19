"use client";

import { Package, TrendingUp, ShoppingBag, DollarSign } from "lucide-react";
import { motion } from "framer-motion";
import { OrderSummary } from "@/types/order";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { UserRole } from "@/contexts/AuthContext";

interface SummaryCardsProps {
  summary: OrderSummary;
  userRole: UserRole;
}

export default function SummaryCards({ summary, userRole }: SummaryCardsProps) {
  const hideMoney = userRole === "warehouse";
  const allCards = [
    {
      title: "Total Order",
      value: formatNumber(summary.totalOrders),
      icon: Package,
      bgColor: "bg-brand-50",
      textColor: "text-brand-500",
      moneyRelated: false,
    },
    {
      title: "Total Pendapatan",
      value: formatCurrency(summary.totalRevenue),
      icon: DollarSign,
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      moneyRelated: true,
    },
    {
      title: "Total Item Terjual",
      value: formatNumber(summary.totalItems),
      icon: ShoppingBag,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
      moneyRelated: false,
    },
    {
      title: "Rata-rata Order",
      value: formatCurrency(
        summary.totalOrders > 0
          ? summary.totalRevenue / summary.totalOrders
          : 0
      ),
      icon: TrendingUp,
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
      moneyRelated: true,
    },
  ];

  const mainCards = hideMoney
    ? allCards.filter((c) => !c.moneyRelated)
    : allCards;

  const combinedTiktokData = {
    orders: summary.byPlatform.tiktok.orders + summary.byPlatform.tokopedia.orders,
    revenue: summary.byPlatform.tiktok.revenue + summary.byPlatform.tokopedia.revenue,
  };

  const platformCards = [
    {
      platform: "shopee" as const,
      name: "Shopee",
      dotColor: "bg-shopee-500",
      borderColor: "border-brand-200",
      barColor: "bg-shopee-500",
      data: summary.byPlatform.shopee,
    },
    {
      platform: "tiktok" as const,
      name: "TikTok & Tokopedia",
      dotColor: "bg-brand-800",
      borderColor: "border-brand-200",
      barColor: "bg-brand-800",
      data: combinedTiktokData,
    },
    {
      platform: "jubelio" as const,
      name: "Jubelio",
      dotColor: "bg-brand-500",
      borderColor: "border-brand-200",
      barColor: "bg-brand-500",
      data: summary.byPlatform.jubelio,
    },
  ];

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Main Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {mainCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-brand-200 p-2.5 sm:p-5"
          >
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-brand-400 font-medium truncate">
                  {card.title}
                </p>
                <p className="text-sm sm:text-2xl font-bold text-brand-800 mt-0.5 sm:mt-1 truncate">
                  {card.value}
                </p>
              </div>
              <div className={cn("p-1.5 sm:p-3 rounded-lg sm:rounded-xl shrink-0", card.bgColor)}>
                <card.icon className={cn("w-3.5 h-3.5 sm:w-6 sm:h-6", card.textColor)} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
        {platformCards.map((card, i) => {
          const data = card.data;
          const percentage =
            summary.totalRevenue > 0
              ? (data.revenue / summary.totalRevenue) * 100
              : 0;

          return (
            <motion.div
              key={card.platform}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.06, duration: 0.3 }}
              className={cn(
                "bg-white rounded-lg sm:rounded-xl shadow-sm border p-2.5 sm:p-5",
                card.borderColor
              )}
            >
              <div className="flex items-center gap-1.5 sm:gap-3 mb-2 sm:mb-4">
                <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full shrink-0", card.dotColor)} />
                <h3 className="font-semibold text-brand-800 text-xs sm:text-base truncate">{card.name}</h3>
              </div>

              <div className="space-y-1.5 sm:space-y-3">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[11px] sm:text-sm text-brand-400">Order</span>
                  <span className="text-xs sm:text-base font-semibold text-brand-700">
                    {formatNumber(data.orders)}
                  </span>
                </div>

                {!hideMoney && (
                  <>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] sm:text-sm text-brand-400">Pendapatan</span>
                      <span className="text-xs sm:text-base font-semibold text-brand-700 truncate">
                        {formatCurrency(data.revenue)}
                      </span>
                    </div>

                    <div className="mt-1 sm:mt-2">
                      <div className="h-1.5 sm:h-2 bg-cream-200 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", card.barColor)}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-[10px] sm:text-xs text-brand-300 mt-0.5 sm:mt-1">
                        {percentage.toFixed(1)}% dari total
                      </p>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
