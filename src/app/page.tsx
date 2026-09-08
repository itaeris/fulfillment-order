"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Menu,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SummaryCards from "@/components/SummaryCards";
import OrderTable from "@/components/OrderTable";
import Charts from "@/components/Charts";
import ComparisonView from "@/components/ComparisonView";
import SettingsView from "@/components/SettingsView";
import { getApiSyncLabels, type ApiSyncSource } from "@/components/ApiSyncBar";
import { DashboardSkeleton, CardsSkeleton } from "@/components/Skeleton";
import { Order, UploadedFile, OrderSummary, DailyStats } from "@/types/order";
import { calculateSummary, calculateDailyStats } from "@/lib/utils";
import { toIndonesianError } from "@/lib/errors";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearDashboardCache,
  getCachedDashboard,
  loadDashboardData,
  type DataSnapshot,
} from "@/lib/client-data";

export default function Dashboard() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const userRole = profile?.role ?? "warehouse";

  type TabId = "dashboard" | "orders" | "compare" | "settings";
  const VALID_TABS: TabId[] = ["dashboard", "orders", "compare", "settings"];
  const TAB_STORAGE_KEY = "activeTab";

  const [orders, setOrders] = useState<Order[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
      if (saved && VALID_TABS.includes(saved)) return saved;
    }
    return "settings";
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState<ApiSyncSource | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncErrorSource, setSyncErrorSource] = useState<ApiSyncSource | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const restoredTab = useRef(false);
  const hasLoaded = useRef(false);
  const syncLock = useRef(false);
  const dataGen = useRef(0);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || params.get("auth_code");
    if (code && (params.has("shop_id") || params.has("main_account_id")) && !params.has("shopee")) {
      window.location.replace(`/api/shopee/callback?${params.toString()}`);
      return;
    }
    if (
      code &&
      !params.has("tiktok") &&
      !params.has("shopee") &&
      (params.has("app_key") || code.startsWith("ROW_"))
    ) {
      const qs = new URLSearchParams({ code });
      const state = params.get("state");
      if (state) qs.set("state", state);
      window.location.replace(`/api/tiktok/callback?${qs.toString()}`);
      return;
    }
    if (params.has("tiktok") || params.has("shopee")) setActiveTab("settings");
    if (params.get("tiktok") === "connected") {
      sessionStorage.removeItem("tiktok_reauth_attempted");
    }
    if (params.get("shopee") === "connected") {
      sessionStorage.removeItem("shopee_reauth_attempted");
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (authLoading || !user || isLoading) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("tiktok") || params.has("shopee")) return;
    if (params.has("code") || params.has("auth_code")) return;

    const tryReauth = async (
      key: string,
      tokenUrl: string,
      authorizeUrl: string
    ) => {
      if (sessionStorage.getItem(key)) return false;
      const data = await fetch(tokenUrl).then((res) => res.json()).catch(() => null);
      if (!data?.needsReauth) return false;
      sessionStorage.setItem(key, "1");
      window.location.href = authorizeUrl;
      return true;
    };

    void (async () => {
      if (await tryReauth("tiktok_reauth_attempted", "/api/tiktok/token", "/api/tiktok/authorize")) {
        return;
      }
      await tryReauth("shopee_reauth_attempted", "/api/shopee/token", "/api/shopee/authorize");
    })();
  }, [authLoading, user, isLoading]);

  const summary: OrderSummary = calculateSummary(orders);
  const dailyStats: DailyStats[] = calculateDailyStats(orders);

  const loadData = useCallback(async (mode: "init" | "refresh" = "refresh") => {
    const gen = ++dataGen.current;
    const apply = (data: DataSnapshot) => {
      if (gen !== dataGen.current) return;
      setOrders(data.orders);
      setUploadedFiles(data.files);
      const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
      if (data.orders.length > 0 && (!savedTab || !VALID_TABS.includes(savedTab))) {
        setActiveTab("dashboard");
      }
    };

    try {
      if (mode === "init") {
        const cached = getCachedDashboard();
        if (cached) {
          apply(cached);
          hasLoaded.current = true;
          setIsLoading(false);
          void loadDashboardData(true).then(apply).catch(() => {});
          return;
        }
        setIsLoading(true);
      } else if (hasLoaded.current) {
        setIsRefreshing(true);
      }

      const data = await loadDashboardData(true);
      apply(data);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      hasLoaded.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (authLoading || !user) return;
    loadData("init");
  }, [authLoading, user, loadData]);

  const handleSync = useCallback(
    async (source: ApiSyncSource) => {
      if (syncLock.current) return;
      syncLock.current = true;
      setSyncing(source);
      setSyncError("");
      setSyncErrorSource(null);
      setSyncProgress(0);
      try {
        if (source === "jubelio" || source === "tiktok" || source === "shopee") {
          const label =
            source === "tiktok" ? "TikTok" : source === "shopee" ? "Shopee" : "Jubelio";
          const syncUrl =
            source === "tiktok"
              ? "/api/tiktok/sync"
              : source === "shopee"
                ? "/api/shopee/sync"
                : "/api/jubelio/sync";
          let startPage = 1;
          let insertedSoFar = 0;
          let cursor: unknown;
          while (true) {
            const res = await fetch(syncUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ startPage, insertedSoFar, cursor }),
            });
            const text = await res.text();
            let data: {
              error?: string;
              done?: boolean;
              count?: number;
              nextPage?: number | null;
              cursor?: unknown;
            };
            try {
              data = JSON.parse(text);
            } catch {
              setSyncErrorSource(source);
              setSyncError(
                res.status === 504 || res.status === 500
                  ? "Pengambilan data terlalu lama. Coba lagi."
                  : `Gagal mengambil data ${label}. Coba lagi.`
              );
              return;
            }
            if (!res.ok) {
              setSyncErrorSource(source);
              setSyncError(
                toIndonesianError(data.error, `Gagal mengambil data ${label}`)
              );
              return;
            }
            insertedSoFar = data.count || insertedSoFar;
            setSyncProgress(insertedSoFar);
            if (data.done) break;
            if (!data.nextPage && !data.cursor) break;
            startPage = data.nextPage || startPage;
            cursor = data.cursor;
          }
          if (source === "tiktok") {
            void fetch("/api/tiktok/refresh-status", { method: "POST" });
          }
          if (source === "shopee") {
            void fetch("/api/shopee/refresh-status", { method: "POST" });
          }
          await loadData();
          return;
        }
      } catch (err: any) {
        setSyncErrorSource(source);
        setSyncError(
          toIndonesianError(err.message, "Terjadi kesalahan jaringan")
        );
      } finally {
        syncLock.current = false;
        setSyncing(null);
      }
    },
    [loadData]
  );

  const apiSync = {
    syncing,
    syncError,
    syncErrorSource,
    syncProgress,
    onSync: handleSync,
    ...getApiSyncLabels(uploadedFiles),
  };

  if (!authLoading && !user) {
    return null;
  }

  if (authLoading || isLoading) {
    return <DashboardSkeleton />;
  }

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: "Dashboard", subtitle: "Ringkasan penjualan Shopee, TikTok, dan Tokopedia" },
    orders: { title: "Pesanan", subtitle: "Daftar pesanan marketplace. Tab Jubelio hanya untuk cermin WMS." },
    compare: { title: "Komparasi", subtitle: "Cermin Jubelio vs Shopee / TikTok — cek yang miss atau belum realtime" },
    settings: { title: "Settings", subtitle: "Kelola data, profil, password, dan user" },
  };
  const pageTitle = pageTitles[activeTab].title;
  const pageSubtitle = pageTitles[activeTab].subtitle;

  return (
    <div className="h-screen flex overflow-hidden bg-cream-100">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        orderCount={orders.length}
        isSaving={false}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        profile={profile}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-brand-200 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-brand-500 hover:bg-cream-200"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-brand-800 truncate">{pageTitle}</h2>
                <p className="text-xs text-brand-400 mt-0.5 hidden sm:block">{pageSubtitle}</p>
              </div>
            </div>

            {(activeTab === "dashboard" || activeTab === "orders") && orders.length > 0 && (
              <div className="flex items-center gap-2 text-sm shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-cream-200 rounded-lg border border-brand-200">
                  <span className="text-brand-400 hidden sm:inline">Total Order</span>
                  <span className="font-bold text-brand-700">{orders.length}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          <AnimatePresence mode="popLayout">
            {activeTab === "compare" && (
              <motion.div
                key="compare"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ComparisonView
                  orders={orders}
                  userRole={userRole}
                  apiSync={apiSync}
                  isRefreshing={isRefreshing}
                />
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
              >
                <SettingsView
                  apiSync={apiSync}
                  isRefreshing={isRefreshing}
                />
              </motion.div>
            )}

            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="space-y-3 sm:space-y-6"
              >
                {orders.length === 0 && !syncing ? (
                  <EmptyDataState onImport={() => setActiveTab("settings")} />
                ) : isRefreshing || !!syncing ? (
                  <CardsSkeleton />
                ) : (
                  <>
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02, duration: 0.12 }}>
                      <SummaryCards summary={summary} userRole={userRole} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.12 }}>
                      <Charts dailyStats={dailyStats} summary={summary} userRole={userRole} />
                    </motion.div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === "orders" && (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
              >
                <OrderTable
                  orders={orders}
                  userRole={userRole}
                  apiSync={apiSync}
                  isRefreshing={isRefreshing}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function EmptyDataState({ onImport }: { onImport: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-brand-200 p-5 sm:p-12 text-center"
    >
      <div className="w-12 sm:w-20 h-12 sm:h-20 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
        <LayoutDashboard className="w-6 sm:w-10 h-6 sm:h-10 text-brand-300" />
      </div>
      <h3 className="text-sm sm:text-xl font-semibold text-brand-700 mb-1.5 sm:mb-2">
        Belum Ada Data
      </h3>
      <p className="text-brand-400 mb-3 sm:mb-4 text-xs sm:text-base">
        Ambil data Shopee, TikTok, atau Jubelio di Settings.
      </p>
      <button
        onClick={onImport}
        className="px-4 py-2 sm:px-6 sm:py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium text-xs sm:text-base"
      >
        Buka Settings
      </button>
    </motion.div>
  );
}
