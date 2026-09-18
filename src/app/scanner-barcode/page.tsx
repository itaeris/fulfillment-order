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
import { expandMatchKeys, isTrackingLikeCode } from "@/lib/order-match";
import { upsertOverviewOrders } from "@/lib/overview-store";
import { supabase } from "@/lib/supabase";
import { classifyWarehouseScan, isAheadPackOrder, isShipTodayQueueOrder } from "@/lib/due-date";
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

function hydrateCancelAlert(raw: any): CancelAlert {
  const source = raw.source === "scan" || raw.source === "queue" ? raw.source : "live";
  return {
    id: String(raw.id || ""),
    orderNumber: String(raw.orderNumber || raw.order_number || ""),
    platform: raw.platform ? String(raw.platform) : undefined,
    source,
    reason: raw.reason ? String(raw.reason) : undefined,
    reasonCode: raw.reasonCode || raw.reason_code ? String(raw.reasonCode || raw.reason_code) : undefined,
    at: raw.at || raw.cancelled_at || raw.cancelledAt ? new Date(raw.at || raw.cancelled_at || raw.cancelledAt) : new Date(),
    dismissed: Boolean(raw.dismissed || raw.dismissed_at),
  };
}

function mergeCancelAlerts(prev: CancelAlert[], incoming: CancelAlert[]) {
  const seen = new Map<string, CancelAlert>();
  for (const alert of [...prev, ...incoming]) {
    const key = cancelAlertMatchKey(alert.orderNumber) || alert.id;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, alert);
      continue;
    }
    const serverId = [alert.id, existing.id].find((id) => /^\d{4}-\d{2}-\d{2}:/.test(id));
    seen.set(key, {
      ...existing,
      ...alert,
      id: serverId || alert.id || existing.id,
      reason: alert.reason || existing.reason,
      reasonCode: alert.reasonCode || existing.reasonCode,
      dismissed: Boolean(existing.dismissed || alert.dismissed),
      at: new Date(existing.at).getTime() <= new Date(alert.at).getTime() ? existing.at : alert.at,
    });
  }
  return Array.from(seen.values());
}

async function fetchTodayCancels(): Promise<CancelAlert[]> {
  const date = warehouseTodayKey();
  const res = await fetch(`/api/overdue/cancels?date=${encodeURIComponent(date)}`, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { alerts?: CancelAlert[] };
  if (!res.ok) return [];
  return (data.alerts || []).map(hydrateCancelAlert);
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
      setAheadOrders((data.orders || []).map(hydrateOrder).filter((order) => order.platform !== "jubelio"));
    } catch (error) {
      console.error("Error loading ahead orders:", error);
    }
  }, []);

  const loadCancels = useCallback(async () => {
    try {
      const today = warehouseTodayKey();
      const fetched = await fetchTodayCancels();
      setCancelAlerts((prev) => {
        const optimistic = prev.filter((alert) => {
          if (alert.dismissed) return false;
          if (/^\d{4}-\d{2}-\d{2}:/.test(alert.id) && !alert.id.startsWith(`${today}:`)) return false;
          if (warehouseTodayKey(new Date(alert.at)) !== today) return false;
          return Date.now() - new Date(alert.at).getTime() < 90_000;
        });
        return mergeCancelAlerts(fetched, optimistic).slice(0, 40);
      });
    } catch (error) {
      console.error("Error loading cancel alerts:", error);
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
    const optimistic = kicked.map((order) =>
      makeCancelAlert(order.orderNumber, source, { platform: order.platform })
    );
    setCancelAlerts((prev) => mergeCancelAlerts(prev, optimistic).slice(0, 40));
    void (async () => {
      try {
        const res = await fetch("/api/overdue/cancels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alerts: kicked.map((order) => ({
              orderNumber: order.orderNumber,
              platform: order.platform,
              source,
            })),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { alerts?: CancelAlert[] };
        const alerts = data.alerts;
        if (!res.ok || !Array.isArray(alerts)) return;
        setCancelAlerts((prev) => mergeCancelAlerts(prev, alerts.map(hydrateCancelAlert)).slice(0, 40));
      } catch {
        // Alert lokal tetap tampil.
      }
    })();
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
      await loadCancels();
    })();
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday, loadAhead, loadCancels]);

  useEffect(() => {
    if (authLoading || !user) return;
    const tick = () => {
      void loadCancels();
    };
    tick();
    const timer = window.setInterval(tick, 8000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authLoading, user, loadCancels]);

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
      setCancelAlerts([]);
      void loadOrders("refresh");
      void loadScans();
      void loadPlacedToday();
      void loadAhead();
      void loadCancels();
    };
    const timer = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, user, loadOrders, loadScans, loadPlacedToday, loadAhead, loadCancels]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const tick = async () => {
      if (ordersRef.current.length === 0) return;
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
      .channel(`overdue-live-${user.id}`)
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cancel_alerts" },
        (payload) => {
          if (!payload.new) return;
          const row = payload.new as { scan_date?: string };
          const scanDate = String(row.scan_date || "").slice(0, 10);
          if (scanDate && scanDate !== warehouseTodayKey()) return;
          setCancelAlerts((prev) => mergeCancelAlerts(prev, [hydrateCancelAlert(payload.new)]).slice(0, 40));
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
        setCancelAlerts((prev) => mergeCancelAlerts(prev, [alert]).slice(0, 40));
        void fetch("/api/overdue/cancels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: alert.orderNumber,
            platform: alert.platform,
            source: alert.source,
            reason: alert.reason,
          }),
        })
          .then((res) => res.json().catch(() => ({})))
          .then((data: { alerts?: CancelAlert[] }) => {
            const alerts = data.alerts;
            if (!Array.isArray(alerts)) return;
            setCancelAlerts((prev) => mergeCancelAlerts(prev, alerts.map(hydrateCancelAlert)).slice(0, 40));
          })
          .catch(() => {});
      }}
      onDismissCancelAlert={(id: string, orderNumber?: string) => {
        setCancelAlerts((prev) =>
          prev.map((alert) =>
            alert.id === id || (orderNumber && cancelAlertMatchKey(alert.orderNumber) === cancelAlertMatchKey(orderNumber))
              ? { ...alert, dismissed: true }
              : alert
          )
        );
        void fetch("/api/overdue/cancels", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, orderNumber }),
        }).catch(() => {});
      }}
      onRefresh={() => {
        void loadOrders("refresh");
        void loadScans();
        void loadPlacedToday();
        void loadAhead();
        void loadCancels();
      }}
      onAdoptOrder={(order) => {
        if (order.platform === "jubelio") return;
        if (isTrackingLikeCode(order.orderNumber)) return;
        const result = classifyWarehouseScan(order);
        if (result === "ahead") {
          setAheadOrders((prev) =>
            prev.some((item) => item.id === order.id || item.orderNumber === order.orderNumber)
              ? prev
              : [order, ...prev]
          );
          return;
        }
        if (result !== "valid" && !isShipTodayQueueOrder(order) && !isAheadPackOrder(order)) return;
        setOrders((prev) =>
          prev.some((item) => item.id === order.id || item.orderNumber === order.orderNumber)
            ? prev
            : [order, ...prev]
        );
        void fetch("/api/overview/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orders: [
              {
                ...order,
                orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : null,
                paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : null,
                shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : null,
                mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : null,
                pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : null,
              },
            ],
          }),
        }).catch(() => {});
      }}
      onSignOut={signOut}
      workerName={profile?.name}
      placedToday={placedToday}
    />
  );
}
