"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingBag,
  GitCompareArrows,
  Table2,
  X,
  LogOut,
  User,
  Settings,
  ChevronUp,
  CalendarClock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";

type TabId = "dashboard" | "orders" | "compare" | "settings";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  orderCount: number;
  isSaving: boolean;
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  orderCount,
  isSaving,
  isOpen,
  onClose,
  profile,
}: SidebarProps) {
  const { signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: LayoutDashboard,
      section: "OVERVIEW",
    },
    {
      id: "orders" as const,
      label: "Pesanan",
      icon: Table2,
      section: "OVERVIEW",
    },
    {
      id: "compare" as const,
      label: "Komparasi",
      icon: GitCompareArrows,
      section: "OVERVIEW",
    },
    {
      id: "settings" as const,
      label: "Settings",
      icon: Settings,
      section: "AKUN",
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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

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
          {Object.entries(grouped).map(([section, items], sectionIdx) => (
            <motion.div
              key={section}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * sectionIdx }}
            >
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
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative",
                        isActive
                          ? "bg-brand-700 text-cream-50"
                          : "text-brand-300 hover:bg-brand-800 hover:text-cream-100"
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.id === "orders" && orderCount > 0 && (
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
            </motion.div>
          ))}

          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-brand-400 uppercase">
              Gudang
            </p>
            <Link
              href="/overview-duedate"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-cream-100"
            >
              <CalendarClock className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Kirim hari ini</span>
            </Link>
          </div>
        </nav>

        {/* Saving indicator */}
        {isSaving && (
          <div className="px-3 py-3 border-t border-brand-800">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-brand-400">
              <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Menyimpan...
            </div>
          </div>
        )}

        {/* User Dropdown */}
        {profile && (
          <div className="px-3 py-3 border-t border-brand-800">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-brand-800 transition-colors"
            >
              <div className="w-8 h-8 bg-brand-700 rounded-full flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-cream-200" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-cream-100 truncate">{profile.name}</p>
                <p className="text-[10px] text-brand-400 truncate">
                  {profile.role === "admin" ? "Admin" : "Warehouse"}
                </p>
              </div>
              <ChevronUp className={cn(
                "w-4 h-4 text-brand-400 transition-transform duration-200",
                userMenuOpen ? "rotate-0" : "rotate-180"
              )} />
            </button>
            
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <button
                    onClick={() => { signOut(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-400 hover:bg-brand-800 hover:text-red-400 transition-colors mt-1"
                  >
                    <LogOut className="w-[18px] h-[18px] shrink-0" />
                    Keluar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </aside>
    </>
  );
}
