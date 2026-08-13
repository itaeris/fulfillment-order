"use client";

import {
  LayoutDashboard,
  Download,
  RefreshCw,
  Loader2,
  ShoppingBag,
  Upload,
  GitCompareArrows,
  X,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";

type TabId = "dashboard" | "upload" | "compare";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  orderCount: number;
  onExportCSV: () => void;
  onClearAll: () => void;
  isSaving: boolean;
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  orderCount,
  onExportCSV,
  onClearAll,
  isSaving,
  isOpen,
  onClose,
  profile,
}: SidebarProps) {
  const { signOut } = useAuth();
  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: LayoutDashboard,
      section: "OVERVIEW",
    },
    {
      id: "compare" as const,
      label: "Komparasi",
      icon: GitCompareArrows,
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

  const handleNav = (tab: TabId) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[220px] bg-brand-900 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5 text-cream-100" />
            </div>
            <h1 className="text-sm font-bold text-cream-50 truncate">Order Dashboard</h1>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-brand-400 hover:text-cream-100"
          >
            <X className="w-5 h-5" />
          </button>
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
                      onClick={() => handleNav(item.id)}
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
                onClick={() => { onExportCSV(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-cream-100 transition-colors"
              >
                <Download className="w-[18px] h-[18px] shrink-0" />
                Export CSV
              </button>
              <button
                onClick={() => { onClearAll(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-cream-100 transition-colors"
              >
                <RefreshCw className="w-[18px] h-[18px] shrink-0" />
                Reset Data
              </button>
            </>
          )}
        </div>

        {/* User info & Logout */}
        {profile && (
          <div className="px-3 py-3 border-t border-brand-800">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-brand-700 rounded-full flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-cream-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-cream-100 truncate">{profile.name}</p>
                <p className="text-[10px] text-brand-400 truncate">
                  {profile.role === "admin" ? "Admin" : "Warehouse"}
                </p>
              </div>
            </div>
            <button
              onClick={() => { signOut(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-brand-400 hover:bg-brand-800 hover:text-red-400 transition-colors mt-1"
            >
              <LogOut className="w-[18px] h-[18px] shrink-0" />
              Keluar
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
