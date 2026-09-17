"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OverdueScanView from "@/components/OverdueScanView";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedOverview, hydrateOrder, loadOverviewData } from "@/lib/client-data";
import { hydrateOverdueScan, isCancelledStatus, scanResultOf, type OverdueScan } from "@/lib/overdue-scan";
import {
  applyLiveStatusPatches,
  uniqueLookupNumbers,
  type LiveStatusPatch,
} from "@/lib/overview-merge";
import { dropCancelledOrders, makeCancelAlert, orderMatchesScanKeys, takeNewlyCancelled, cancelAlertMatchKey, type CancelAlert } from "@/lib/live-cancel";
import { expandMatchKeys } from "@/lib/order-match";
import { upsertOverviewOrders } from "@/lib/overview-store";
import { supabase } from "@/lib/supabase";
import { indonesiaOrderCutoffKey, warehouseTodayKey } from "@/lib/timezone";
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
  const [aheadOrders, setAheadOrders] = useState<Order[]>([]);
  const [scans, setScans] = useState<OverdueScan[]>([]);
  const [placedToday, setPlacedToday] = useState<{ total: number; shopee: number; tiktok: number }>();
  const [cancelAlerts, setCancelAlerts] = useState<CancelAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadLock = useRef(false);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const scansRef = useRef<OverdueScan[]>([]);
  scansRef.current = scans;
  const aheadRef = useRef<Order[]>([]);
  aheadRef.current = aheadOrders;
  const dayKeyRef = useRef(warehouseTodayKey());
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

  const loadAhead = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/ahead", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { orders?: Order[]; error?: string };
      if (!res.ok) return;
      setAheadOrders((data.orders || []).map(hydrateOrder));
    } catch (error) {
      console.error("Error loading ahead orders:", error);
    }
  }, []);

  const validScanKeys = useCallback(() => {
    const keys = new Set<string>();
    for (const scan of scansRef.current) {
      const result = scanResultOf(scan);
      if (result !== "valid" && result !== "ahead") continue;
      for (const key of expandMatchKeys(scan.orderNumber || scan.scannedCode)) keys.add(key);
    }
    return keys;
  }, []);

  const pushCancelAlerts = useCallback((kicked: Order[], source: CancelAlert["source"]) => {
    if (kicked.length === 0) return;
    setCancelAlerts((prev) => {
      const next = [...kicked.map((order) => makeCancelAlert(order.orderNumber, source)), ...prev];
      const seen = new Set<string>();
      return next.filter((alert) => {
        const key = cancelAlertMatchKey(alert.orderNumber);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
    });
  }, []);

  const kickCancelled = useCallback(
    async (kicked: Order[]) => {
      if (kicked.length === 0) return;
      const ids = Array.from(new Set(kicked.map((order) => order.id)));
      const numbers = Array.from(
        new Set(kicked.map((order) => String(order.orderNumber || "").trim()).filter(Boolean))
      );
      const idSet = new Set(ids);
      const numberSet = new Set(numbers);
      const drop = (list: Order[]) =>
        list.filter((order) => !idSet.has(order.id) && !numberSet.has(String(order.orderNumber || "").trim()));
      const nextOrders = drop(ordersRef.current);
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      setAheadOrders((prev) => drop(prev));
      setScans((prev) =>
        prev.map((scan) => {
          const hit =
            (scan.orderId && idSet.has(scan.orderId)) ||
            (scan.orderNumber && numberSet.has(scan.orderNumber));
          if (!hit || scanResultOf(scan) === "cancelled") return scan;
          return { ...scan, matched: true, result: "cancelled" };
        })
      );
      try {
        await fetch("/api/overview/kick-cancelled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, numbers }),
        });
      } catch {
        // Antrian lokal sudah dibuang; sync server dicoba lagi di tick berikutnya.
      }
      void loadPlacedToday();
    },
    [loadPlacedToday]
  );

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
      const patched = applyLiveStatusPatches(current, patches).map((order, index) =>
        order === current[index] ? current[index] : hydrateOrder(order)
      );
      const newlyCancelled = takeNewlyCancelled(current, patched);
      if (newlyCancelled.length > 0) {
        const scanned = validScanKeys();
        const afterScan = newlyCancelled.filter((order) =>
          orderMatchesScanKeys(order.orderNumber, scanned)
        );
        const queueOnly = newlyCancelled.filter(
          (order) => !orderMatchesScanKeys(order.orderNumber, scanned)
        );
        pushCancelAlerts(afterScan, "live");
        pushCancelAlerts(queueOnly, "queue");
        await kickCancelled(newlyCancelled);
      }
      const kept = dropCancelledOrders(patched);
      const changed = kept.filter((order, index) => order !== current[index] && !isCancelledStatus(order.status));
      if (changed.length > 0) await upsertOverviewOrders(changed);
      return kept;
    } catch {
      return current;
    }
  }, [kickCancelled, pushCancelAlerts, validScanKeys]);

  useEffect(() => {
    if (authLoading || !user) return;
    void (async () => {
      await loadOrders("full");
      await loadScans();
      await loadPlacedToday();
      await loadAhead();
    })();
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday, loadAhead]);

  useEffect(() => {
    if (authLoading || !user) return;
    const tick = () => {
      const cutoff = indonesiaOrderCutoffKey();
      if (cutoffKeyRef.current !== cutoff) {
        cutoffKeyRef.current = cutoff;
        void loadPlacedToday();
      }
      const today = warehouseTodayKey();
      if (dayKeyRef.current === today) return;
      dayKeyRef.current = today;
      setScans([]);
      void loadOrders("refresh");
      void loadScans();
      void loadPlacedToday();
      void loadAhead();
    };
    const timer = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday, loadAhead]);

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
    const tick = async () => {
      if (document.hidden) return;
      const numbers = Array.from(
        new Set(
          scansRef.current
            .filter((scan) => {
              const result = scanResultOf(scan);
              return result === "valid" || result === "ahead";
            })
            .map((scan) => String(scan.orderNumber || "").trim())
            .filter(Boolean)
        )
      ).slice(0, 40);
      if (numbers.length === 0) return;
      try {
        const res = await fetch("/api/overview/check-live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers }),
        });
        const data = (await res.json().catch(() => ({}))) as { cancelled?: LiveStatusPatch[] };
        const cancelled = data.cancelled || [];
        if (cancelled.length === 0) return;
        const keys = new Set(cancelled.map((patch) => String(patch.orderNumber || "").trim()).filter(Boolean));
        const hit = [...ordersRef.current, ...aheadRef.current].filter((order) =>
          keys.has(String(order.orderNumber || "").trim())
        );
        const fromScans = scansRef.current.filter(
          (scan) => scan.orderNumber && keys.has(scan.orderNumber) && scanResultOf(scan) !== "cancelled"
        );
        const kicked =
          hit.length > 0
            ? hit
            : fromScans.map((scan) => ({
                id: scan.orderId || scan.orderNumber || scan.id,
                orderNumber: scan.orderNumber || "",
                platform: (scan.platform as Order["platform"]) || "shopee",
                customerName: "",
                productName: "",
                quantity: 1,
                price: 0,
                totalAmount: 0,
                status: "cancelled" as const,
                orderDate: new Date(),
              }));
        if (kicked.length === 0) return;
        pushCancelAlerts(kicked, "live");
        await kickCancelled(kicked);
      } catch {
        // Tick berikutnya mengulang cek API.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 20_000);
    return () => window.clearInterval(timer);
  }, [authLoading, user, kickCancelled, pushCancelAlerts]);

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
      aheadOrders={aheadOrders}
      scans={scans}
      onScansChange={setScans}
      onKickCancelled={(kicked) => {
        void kickCancelled(kicked);
      }}
      cancelAlerts={cancelAlerts}
      onCancelAlert={(alert) => {
        setCancelAlerts((prev) => {
          const key = cancelAlertMatchKey(alert.orderNumber);
          return [alert, ...prev.filter((item) => cancelAlertMatchKey(item.orderNumber) !== key)].slice(
            0,
            12
          );
        });
      }}
      onDismissCancelAlert={(id) => {
        setCancelAlerts((prev) => prev.filter((alert) => alert.id !== id));
      }}
      onRefresh={() => {
        void loadOrders("refresh");
        void loadScans();
        void loadPlacedToday();
        void loadAhead();
      }}
      onSignOut={signOut}
      workerName={profile?.name}
      placedToday={placedToday}
    />
  );
}
