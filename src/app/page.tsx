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
import { Order, Platform, UploadedFile, OrderSummary, DailyStats } from "@/types/order";
import { parseExcelFile, detectPlatform } from "@/lib/excel-parser";
import { calculateSummary, calculateDailyStats } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const userRole = profile?.role ?? "warehouse";

  type TabId = "dashboard" | "compare" | "settings";
  const VALID_TABS: TabId[] = ["dashboard", "compare", "settings"];
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
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const restoredTab = useRef(false);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  const summary: OrderSummary = calculateSummary(orders);
  const dailyStats: DailyStats[] = calculateDailyStats(orders);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        const ordersRes = await fetch("/api/orders");
        const ordersData = await ordersRes.json();

        const filesRes = await fetch("/api/files");
        const filesData = await filesRes.json();

        if (ordersData.orders) {
          const loadedOrders = ordersData.orders.map((order: any) => ({
            ...order,
            orderDate: new Date(order.orderDate),
            paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
            shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
            mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
          }));
          setOrders(loadedOrders);

          const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
          if (loadedOrders.length > 0 && (!savedTab || !VALID_TABS.includes(savedTab))) {
            setActiveTab("dashboard");
          }
        }

        if (filesData.files) {
          const loadedFiles = filesData.files.map((file: any) => ({
            ...file,
            uploadedAt: new Date(file.uploadedAt),
          }));
          setUploadedFiles(loadedFiles);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const saveOrdersToDb = async (newOrders: Order[]) => {
    try {
      setIsSaving(true);
      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: newOrders }),
      });
    } catch (error) {
      console.error("Error saving orders:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveFileToDb = async (file: { name: string; platform: string; orderCount: number }) => {
    try {
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(file),
      });
    } catch (error) {
      console.error("Error saving file:", error);
    }
  };

  const handleFileUpload = useCallback(
    async (file: File, platform: Platform): Promise<number> => {
      return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
          const buffer = e.target?.result as ArrayBuffer;

          const detectedPlatform = detectPlatform(file.name);
          const finalPlatform =
            detectedPlatform !== "shopee" ? detectedPlatform : platform;

          const parsedOrders = parseExcelFile(buffer, finalPlatform);

          setOrders((prev) => {
            const existingIds = new Set(prev.map((o) => o.id));
            const newOrders = parsedOrders.filter((o) => !existingIds.has(o.id));

            if (newOrders.length > 0) {
              saveOrdersToDb(newOrders);
            }

            return [...prev, ...newOrders];
          });

          const uploadedFile = {
            name: file.name,
            platform: finalPlatform,
            uploadedAt: new Date(),
            orderCount: parsedOrders.length,
          };

          setUploadedFiles((prev) => [
            ...prev.filter((f) => f.name !== file.name),
            uploadedFile,
          ]);

          saveFileToDb({
            name: file.name,
            platform: finalPlatform,
            orderCount: parsedOrders.length,
          });

          resolve(parsedOrders.length);
        };

        reader.readAsArrayBuffer(file);
      });
    },
    []
  );

  const handleRemoveFile = useCallback(async (fileName: string) => {
    const file = uploadedFiles.find((f) => f.name === fileName);
    if (file) {
      setOrders((prev) =>
        prev.filter((o) => !o.id.startsWith(`${file.platform}-`))
      );
      setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName));

      try {
        await fetch(`/api/files?name=${encodeURIComponent(fileName)}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error removing file:", error);
      }
    }
  }, [uploadedFiles]);

  const handleClearAll = useCallback(async () => {
    setOrders([]);
    setUploadedFiles([]);

    try {
      await Promise.all([
        fetch("/api/orders", { method: "DELETE" }),
        fetch("/api/files", { method: "DELETE" }),
      ]);
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  }, []);

  const handleExportCSV = useCallback(() => {
    if (orders.length === 0) return;

    const headers = [
      "Order Number", "Platform", "Customer", "Recipient", "Product",
      "Variation", "SKU", "Quantity", "Price", "Total", "Status",
      "Order Date", "Must Ship Before", "Shipping Option", "Tracking",
      "Phone", "City", "Province",
    ];

    const rows = orders.map((o) => [
      o.orderNumber, o.platform, o.customerName, o.recipientName || "",
      o.productName, o.variation || "", o.sku || "", o.quantity, o.price,
      o.totalAmount, o.status,
      o.orderDate instanceof Date ? o.orderDate.toISOString().split("T")[0] : o.orderDate,
      o.mustShipBefore instanceof Date ? o.mustShipBefore.toISOString() : o.mustShipBefore || "",
      o.shippingOption || "", o.trackingNumber || "", o.phone || "",
      o.city || "", o.province || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [orders]);

  if (authLoading || !user || isLoading) {
    return (
      <motion.div
        className="h-screen bg-cream-100 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="loader" />
          <p className="text-brand-400">Memuat data...</p>
        </motion.div>
      </motion.div>
    );
  }

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: "Dashboard", subtitle: "Ringkasan performa order dari semua platform" },
    compare: { title: "Komparasi", subtitle: "Bandingkan data Jubelio dengan Shopee / TikTok" },
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
        isSaving={isSaving}
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

            {activeTab === "dashboard" && orders.length > 0 && (
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {activeTab === "compare" && (
              <motion.div
                key="compare"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <ComparisonView orders={orders} userRole={userRole} />
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <SettingsView
                  onFileUpload={handleFileUpload}
                  uploadedFiles={uploadedFiles}
                  onRemoveFile={handleRemoveFile}
                  onExportCSV={handleExportCSV}
                  onClearAll={handleClearAll}
                  orderCount={orders.length}
                />
              </motion.div>
            )}

            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 sm:space-y-6"
              >
                {orders.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-xl shadow-sm border border-brand-200 p-8 sm:p-12 text-center"
                  >
                    <div className="w-16 sm:w-20 h-16 sm:h-20 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <LayoutDashboard className="w-8 sm:w-10 h-8 sm:h-10 text-brand-300" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-brand-700 mb-2">
                      Belum Ada Data
                    </h3>
                    <p className="text-brand-400 mb-4 text-sm sm:text-base">
                      Import file Excel dari marketplace untuk memulai.
                    </p>
                    <button
                      onClick={() => setActiveTab("settings")}
                      className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium text-sm sm:text-base"
                    >
                      Import Data
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                      <SummaryCards summary={summary} userRole={userRole} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                      <Charts dailyStats={dailyStats} summary={summary} userRole={userRole} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                      <OrderTable orders={orders} userRole={userRole} />
                    </motion.div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
