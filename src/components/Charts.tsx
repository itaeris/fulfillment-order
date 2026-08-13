"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { DailyStats, OrderSummary } from "@/types/order";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

interface ChartsProps {
  dailyStats: DailyStats[];
  summary: OrderSummary;
}

const PLATFORM_COLORS = {
  shopee: "#ee4d2d",
  tiktok: "#3D2319",
  jubelio: "#7A4232",
};

const STATUS_COLORS = {
  pending: "#eab308",
  processing: "#7A4232",
  shipped: "#8b5cf6",
  delivered: "#22c55e",
  cancelled: "#ef4444",
  returned: "#A8917E",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  processing: "Diproses",
  shipped: "Dikirim",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
  returned: "Dikembalikan",
};

export default function Charts({ dailyStats, summary }: ChartsProps) {
  const combinedTiktokRevenue = summary.byPlatform.tiktok.revenue + summary.byPlatform.tokopedia.revenue;

  const platformPieData = [
    {
      name: "Shopee",
      value: summary.byPlatform.shopee.revenue,
      color: PLATFORM_COLORS.shopee,
    },
    {
      name: "TikTok & Tokopedia",
      value: combinedTiktokRevenue,
      color: PLATFORM_COLORS.tiktok,
    },
    {
      name: "Jubelio",
      value: summary.byPlatform.jubelio.revenue,
      color: PLATFORM_COLORS.jubelio,
    },
  ].filter((item) => item.value > 0);

  const statusBarData = Object.entries(summary.byStatus)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      fill: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "#A8917E",
    }))
    .filter((item) => item.value > 0);

  const formatChartDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "dd MMM", { locale: id });
    } catch {
      return dateStr;
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-brand-200">
          <p className="font-medium text-brand-700 mb-2">
            {formatChartDate(label)}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-brand-200">
          <p className="font-medium text-brand-700">{data.name}</p>
          <p className="text-sm text-brand-500">
            {formatCurrency(data.value)}
          </p>
          <p className="text-xs text-brand-300">
            {((data.value / summary.totalRevenue) * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (dailyStats.length === 0 && summary.totalOrders === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue Trend Chart */}
      {dailyStats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-5">
          <h3 className="text-lg font-semibold text-brand-800 mb-4">
            Tren Pendapatan
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats}>
                <defs>
                  <linearGradient id="shopeeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={PLATFORM_COLORS.shopee}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={PLATFORM_COLORS.shopee}
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="tiktokGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={PLATFORM_COLORS.tiktok}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={PLATFORM_COLORS.tiktok}
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="jubelioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={PLATFORM_COLORS.jubelio}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={PLATFORM_COLORS.jubelio}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  stroke="#A8917E"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) =>
                    value >= 1000000
                      ? `${(value / 1000000).toFixed(1)}jt`
                      : value >= 1000
                      ? `${(value / 1000).toFixed(0)}rb`
                      : value
                  }
                  stroke="#A8917E"
                  fontSize={12}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="shopee"
                  name="Shopee"
                  stroke={PLATFORM_COLORS.shopee}
                  fill="url(#shopeeGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="tiktok"
                  name="TikTok & Tokopedia"
                  stroke={PLATFORM_COLORS.tiktok}
                  fill="url(#tiktokGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="jubelio"
                  name="Jubelio"
                  stroke={PLATFORM_COLORS.jubelio}
                  fill="url(#jubelioGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Platform Distribution Pie Chart */}
      {platformPieData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-5">
          <h3 className="text-lg font-semibold text-brand-800 mb-4">
            Distribusi per Platform
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {platformPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => (
                    <span className="text-sm text-brand-500">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Status Distribution Bar Chart */}
      {statusBarData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-brand-800 mb-4">
            Status Order
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD3" />
                <XAxis type="number" stroke="#A8917E" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#A8917E"
                  fontSize={12}
                  width={100}
                />
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), "Order"]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E8DDD3",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
