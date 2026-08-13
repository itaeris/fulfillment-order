"use client";

import {
  LayoutDashboard,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Package,
  Loader2,
  ShoppingBag,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab: "dashboard" | "upload";
  onTabChange: (tab: "dashboard" | "upload") => void;
  orderCount: number;
  onExportCSV: () => void;
  onClearAll: () => void;
  isSaving: boolean;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  orderCount,
  onExportCSV,
  onClearAll,
  isSaving,
}: SidebarProps) {
  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: LayoutDashboard,
      section: "OVERVIEW",
    },
    {
      id: "upload" as const,
      label: "Import Data",
      icon: Upload,
      section: "DATA",
    },
  ];

  const grouped = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);

  return (
    <aside className="w-[220px] bg-brand-900 flex flex-col h-screen shrink-0">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-cream-100" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-cream-50 truncate">Order Dashboard</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section}>
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-brand-400 uppercase">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-brand-700 text-cream-50"
                        : "text-brand-300 hover:bg-brand-800 hover:text-cream-100"
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.id === "dashboard" && orderCount > 0 && (
                      <span className={cn(
                        "ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                        isActive
                          ? "bg-brand-500 text-cream-50"
                          : "bg-brand-800 text-brand-300"
                      )}>
                        {orderCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-brand-800 space-y-1">
        {isSaving && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-brand-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Menyimpan...
          </div>
        )}
        {orderCount > 0 && (
          <>
            <button
              onClick={onExportCSV}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-cream-100 transition-colors"
            >
              <Download className="w-[18px] h-[18px] shrink-0" />
              Export CSV
            </button>
            <button
              onClick={onClearAll}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-cream-100 transition-colors"
            >
              <RefreshCw className="w-[18px] h-[18px] shrink-0" />
              Reset Data
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
