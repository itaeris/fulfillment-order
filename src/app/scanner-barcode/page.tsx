"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OverdueScanView from "@/components/OverdueScanView";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedOverview, hydrateOrder, loadOverviewData } from "@/lib/client-data";
import { supabase } from "@/lib/supabase";
import { Order } from "@/types/order";
import type { OverdueScan } from "@/lib/overdue-scan";

function hydrateScan(scan: OverdueScan): OverdueScan {
  return {
    ...scan,
    scannedAt: scan.scannedAt ? new Date(scan.scannedAt) : new Date(),
  };
}

async function fetchTodayScans(): Promise<OverdueScan[]> {
  const res = await fetch("/api/overdue/scans", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { scans?: OverdueScan[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Gagal mengambil data scan");
  return (data.scans || []).map(hydrateScan);
}

export default function ScannerBarcodePage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [scans, setScans] = useState<OverdueScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadLock = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const loadData = useCallback(async (mode: "full" | "refresh" = "full") => {
    if (loadLock.current && mode === "full") return;
    loadLock.current = true;
    try {
      if (mode === "full") {
        const cached = getCachedOverview();
        if (cached) {
          setOrders(cached.orders);
          setIsLoading(false);
        }
      }
      const overview = await loadOverviewData(true);
      setOrders(overview.orders.map(hydrateOrder));
      try {
        setScans(await fetchTodayScans());
      } catch (error) {
        console.error("Error loading overdue scans:", error);
      }
    } catch (error) {
      console.error("Error loading overdue data:", error);
    } finally {
      loadLock.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadData("full");
  }, [authLoading, user, loadData]);

  useEffect(() => {
    if (authLoading || !user) return;
    let debounce: number | undefined;
    const reload = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void loadData("refresh");
      }, 600);
    };
    const channel = supabase
      .channel("overdue-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overdue_scans" },
        reload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overview_orders" },
        reload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_status" },
        reload
      )
      .subscribe();
    return () => {
      window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user, loadData]);

  if (!authLoading && !user) return null;
  if (authLoading || isLoading) return <OverviewSkeleton />;

  return (
    <OverdueScanView
      orders={orders}
      scans={scans}
      onScansChange={setScans}
      onRefresh={() => loadData("refresh")}
      onSignOut={signOut}
      workerName={profile?.name}
    />
  );
}
