"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OverdueScanView from "@/components/OverdueScanView";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedOverview, hydrateOrder, loadOverviewData } from "@/lib/client-data";
import { hydrateOverdueScan, type OverdueScan } from "@/lib/overdue-scan";
import {
  applyLiveStatusPatches,
  uniqueLookupNumbers,
  type LiveStatusPatch,
} from "@/lib/overview-merge";
import { upsertOverviewOrders } from "@/lib/overview-store";
import { supabase } from "@/lib/supabase";
import { indonesiaDateKey, indonesiaOrderCutoffKey } from "@/lib/timezone";
import { Order } from "@/types/order";

async function fetchTodayScans(): Promise<OverdueScan[]> {
  const res = await fetch("/api/overdue/scans", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { scans?: OverdueScan[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Gagal mengambil data scan");
  return (data.scans || []).map((scan) => hydrateOverdueScan(scan));
}

function mergeScan(prev: OverdueScan[], next: OverdueScan) {
  return [next, ...prev.filter((item) => item.id !== next.id)];
}

export default function ScannerBarcodePage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [scans, setScans] = useState<OverdueScan[]>([]);
  const [placedToday, setPlacedToday] = useState<{ total: number; shopee: number; tiktok: number }>();
  const [isLoading, setIsLoading] = useState(true);
  const loadLock = useRef(false);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const dayKeyRef = useRef(indonesiaDateKey());
  const cutoffKeyRef = useRef(indonesiaOrderCutoffKey());

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const loadOrders = useCallback(async (mode: "full" | "refresh" = "full") => {
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
      if (mode === "full") {
        try {
          const retain = await fetch("/api/overview/retain-today", { method: "POST" });
          if (retain.ok) {
            const retained = await loadOverviewData(true);
            setOrders(retained.orders.map(hydrateOrder));
          }
        } catch {
          // Total hari ini tetap memakai data antrian yang sudah ada.
        }
      }
    } catch (error) {
      console.error("Error loading overdue data:", error);
    } finally {
      loadLock.current = false;
      setIsLoading(false);
    }
  }, []);

  const loadScans = useCallback(async () => {
    try {
      setScans(await fetchTodayScans());
    } catch (error) {
      console.error("Error loading overdue scans:", error);
    }
  }, []);

  const loadPlacedToday = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/placed-today", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        total?: number;
        shopee?: number;
        tiktok?: number;
      };
      if (!res.ok) return;
      setPlacedToday({
        total: data.total || 0,
        shopee: data.shopee || 0,
        tiktok: data.tiktok || 0,
      });
    } catch (error) {
      console.error("Error loading placed today:", error);
    }
  }, []);

  const applyLive = useCallback(async (current: Order[]) => {
    const numbers = uniqueLookupNumbers(current);
    if (numbers.length === 0) return current;
    try {
      const res = await fetch("/api/overview/live-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers }),
      });
      const data = (await res.json()) as { patches?: LiveStatusPatch[] };
      const patches = data.patches || [];
      if (patches.length === 0) return current;
      const patched = applyLiveStatusPatches(current, patches);
      const changed = patched
        .filter((order, index) => order !== current[index])
        .map(hydrateOrder);
      if (changed.length === 0) return current;
      const next = patched.map((order, index) =>
        order === current[index] ? current[index] : hydrateOrder(order)
      );
      await upsertOverviewOrders(changed);
      return next;
    } catch {
      return current;
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void (async () => {
      await loadOrders("full");
      await loadScans();
      await loadPlacedToday();
    })();
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday]);

  useEffect(() => {
    if (authLoading || !user) return;
    const tick = () => {
      const cutoff = indonesiaOrderCutoffKey();
      if (cutoffKeyRef.current !== cutoff) {
        cutoffKeyRef.current = cutoff;
        void loadPlacedToday();
      }
      const today = indonesiaDateKey();
      if (dayKeyRef.current === today) return;
      dayKeyRef.current = today;
      setScans([]);
      void loadOrders("refresh");
      void loadScans();
      void loadPlacedToday();
    };
    const timer = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const tick = async () => {
      if (document.hidden || ordersRef.current.length === 0) return;
      const next = await applyLive(ordersRef.current);
      if (!cancelled) {
        ordersRef.current = next;
        setOrders(next);
      }
    };
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authLoading, user, applyLive]);

  useEffect(() => {
    if (authLoading || !user) return;
    let debounce: number | undefined;
    const reloadOrders = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void loadOrders("refresh");
      }, 600);
    };
    const channel = supabase
      .channel("overdue-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "overdue_scans" },
        (payload) => {
          if (!payload.new) return;
          setScans((prev) => mergeScan(prev, hydrateOverdueScan(payload.new)));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overview_orders" },
        reloadOrders
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_status" },
        () => {
          void applyLive(ordersRef.current).then((next) => {
            ordersRef.current = next;
            setOrders(next);
          });
        }
      )
      .subscribe();
    return () => {
      window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user, loadOrders, applyLive]);

  if (!authLoading && !user) return null;
  if (authLoading || isLoading) return <OverviewSkeleton />;

  return (
    <OverdueScanView
      orders={orders}
      scans={scans}
      onScansChange={setScans}
      onOrdersChange={(next) => {
        ordersRef.current = next;
        setOrders(next);
      }}
      onSkipShipping={(kicked) => {
        void upsertOverviewOrders(kicked);
      }}
      onRefresh={() => {
        void loadOrders("refresh");
        void loadScans();
        void loadPlacedToday();
      }}
      onSignOut={signOut}
      workerName={profile?.name}
      placedToday={placedToday}
    />
  );
}
