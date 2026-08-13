"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  FileSpreadsheet,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import FileUpload from "@/components/FileUpload";
import SummaryCards from "@/components/SummaryCards";
import OrderTable from "@/components/OrderTable";
import Charts from "@/components/Charts";
import { Order, Platform, UploadedFile, OrderSummary, DailyStats } from "@/types/order";
import { parseExcelFile, detectPlatform } from "@/lib/excel-parser";
import { calculateSummary, calculateDailyStats } from "@/lib/utils";

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "upload">("upload");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const summary: OrderSummary = calculateSummary(orders);
  const dailyStats: DailyStats[] = calculateDailyStats(orders);

  // Load data from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch orders
        const ordersRes = await fetch("/api/orders");
        const ordersData = await ordersRes.json();
        
        // Fetch uploaded files
        const filesRes = await fetch("/api/files");
        const filesData = await filesRes.json();
        
        if (ordersData.orders) {
          // Convert date strings back to Date objects
          const loadedOrders = ordersData.orders.map((order: any) => ({
            ...order,
            orderDate: new Date(order.orderDate),
            paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
            shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
            mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
          }));
          setOrders(loadedOrders);
          
          // Auto switch to dashboard if there's data
          if (loadedOrders.length > 0) {
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

  // Save orders to database
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

  // Save uploaded file to database
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

          // Auto-detect platform from filename if possible
          const detectedPlatform = detectPlatform(file.name);
          const finalPlatform =
            detectedPlatform !== "shopee" ? detectedPlatform : platform;

          const parsedOrders = parseExcelFile(buffer, finalPlatform);

          // Add new orders (avoid duplicates based on orderNumber + platform)
          setOrders((prev) => {
            const existingIds = new Set(prev.map((o) => o.id));
            const newOrders = parsedOrders.filter((o) => !existingIds.has(o.id));
            
            // Save to database
            if (newOrders.length > 0) {
              saveOrdersToDb(newOrders);
            }
            
            return [...prev, ...newOrders];
          });

          // Track uploaded file
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
          
          // Save file info to database
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
      // Remove from state
      setOrders((prev) =>
        prev.filter((o) => !o.id.startsWith(`${file.platform}-`))
      );
      setUploadedFiles((prev) => prev.filter((f) => f.name !== fileName));
      
      // Remove from database
      try {
        await fetch(`/api/files?name=${encodeURIComponent(fileName)}`, {
          method: "DELETE",
        });
        // Note: We should also delete orders by file, but for simplicity
        // we'll delete all orders for that platform
      } catch (error) {
        console.error("Error removing file:", error);
      }
    }
  }, [uploadedFiles]);

  const handleClearAll = useCallback(async () => {
    setOrders([]);
    setUploadedFiles([]);
    
    // Clear from database
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
      "Order Number",
      "Platform",
      "Customer",
      "Recipient",
      "Product",
      "Variation",
      "SKU",
      "Quantity",
      "Price",
      "Total",
      "Status",
      "Order Date",
      "Must Ship Before",
      "Shipping Option",
      "Tracking",
      "Phone",
      "City",
      "Province",
    ];

    const rows = orders.map((o) => [
      o.orderNumber,
      o.platform,
      o.customerName,
      o.recipientName || "",
      o.productName,
      o.variation || "",
      o.sku || "",
      o.quantity,
      o.price,
      o.totalAmount,
      o.status,
      o.orderDate instanceof Date ? o.orderDate.toISOString().split("T")[0] : o.orderDate,
      o.mustShipBefore instanceof Date ? o.mustShipBefore.toISOString() : o.mustShipBefore || "",
      o.shippingOption || "",
      o.trackingNumber || "",
      o.phone || "",
      o.city || "",
      o.province || "",
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

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  Order Dashboard
                </h1>
                <p className="text-xs text-slate-500">
                  Shopee • TikTok Shop & Tokopedia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </div>
              )}
              {orders.length > 0 && (
                <>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "upload"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Import Data
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "dashboard"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
              {orders.length > 0 && (
                <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
                  {orders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {activeTab === "upload" && (
          <div className="space-y-6">
            <FileUpload
              onFileUpload={handleFileUpload}
              uploadedFiles={uploadedFiles}
              onRemoveFile={handleRemoveFile}
            />

            {orders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-blue-700 text-sm">
                  <span className="font-semibold">{orders.length} order</span>{" "}
                  tersimpan di database. Klik tab{" "}
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className="font-semibold underline"
                  >
                    Dashboard
                  </button>{" "}
                  untuk melihat data.
                </p>
              </div>
            )}

            {/* Quick Tips */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Panduan Import
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-shopee-50 rounded-lg">
                  <h4 className="font-semibold text-shopee-600 mb-2">Shopee</h4>
                  <p className="text-sm text-slate-600">
                    Export dari Seller Centre &gt; Pesanan &gt; Export. Pilih
                    format Excel/CSV.
                  </p>
                </div>
                <div className="p-4 bg-slate-100 rounded-lg">
                  <h4 className="font-semibold text-slate-800 mb-2">
                    TikTok &amp; Tokopedia
                  </h4>
                  <p className="text-sm text-slate-600">
                    Export dari Seller Center &gt; Orders &gt; Export Orders.
                    Pilih format XLSX.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {orders.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LayoutDashboard className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                  Belum Ada Data
                </h3>
                <p className="text-slate-500 mb-4">
                  Import file Excel dari marketplace untuk memulai.
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  Import Data
                </button>
              </div>
            ) : (
              <>
                <SummaryCards summary={summary} />
                <Charts dailyStats={dailyStats} summary={summary} />
                <OrderTable orders={orders} />
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-500">
            Order Dashboard - Marketplace Order Management
          </p>
        </div>
      </footer>
    </div>
  );
}
