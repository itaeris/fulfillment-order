"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type ApiSyncSource } from "@/components/ApiSyncBar";
import DueDateOverviewView, {
  type OverviewSyncProgress,
  type RealtimeState,
} from "@/components/DueDateOverview";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyLiveStatusPatches,
  uniqueLookupNumbers,
  type LiveStatusPatch,
} from "@/lib/overview-merge";
import {
  clearOverviewStore,
  migrateLegacyOverviewIfNeeded,
  replaceOverviewPlatforms,
  saveOverviewFile,
  upsertOverviewOrders,
} from "@/lib/overview-store";
import {
  getCachedOverview,
  hydrateOrder,
  loadOverviewData,
  type DataSnapshot,
} from "@/lib/client-data";
import { toIndonesianError } from "@/lib/errors";
import { isShipTodayQueueOrder, mergeTodayQueueWithPickedUp } from "@/lib/due-date";
import { dropCancelledOrders, takeNewlyCancelled } from "@/lib/live-cancel";
import { indonesiaOrderCutoffKey, warehouseTodayKey } from "@/lib/timezone";
import { fetchMarketplaceTokenStatus, isShopLinkedPayload } from "@/lib/shop-link-status";
import { supabase } from "@/lib/supabase";
import { Order, Platform, UploadedFile } from "@/types/order";

const SYNC_URL: Record<ApiSyncSource, string> = {
  shopee: "/api/shopee/sync",
  tiktok: "/api/tiktok/sync",
  jubelio: "/api/jubelio/sync",
};

const SYNC_FILE: Record<ApiSyncSource, { name: string; platform: Platform }> = {
  shopee: { name: "Shopee Open API", platform: "shopee" },
  tiktok: { name: "TikTok Shop API", platform: "tiktok" },
  jubelio: { name: "Jubelio API", platform: "jubelio" },
};

const MAX_API_PAGES = 20;
const AUTO_SYNC_MS = 3 * 60 * 1000;

function sourceLabel(source: ApiSyncSource) {
  return source === "jubelio" ? "Jubelio" : source === "shopee" ? "Shopee" : "TikTok";
}

function fetchProgress(source: ApiSyncSource, page: number, count: number): OverviewSyncProgress {
  const percent = Math.min(82, 8 + Math.round((page / MAX_API_PAGES) * 74));
  return {
    source,
    percent,
    label:
      count > 0
        ? `${sourceLabel(source)} · halaman ${page} · ${count.toLocaleString("id-ID")} pesanan`
        : `${sourceLabel(source)} · mengambil halaman ${page}...`,
  };
}

export default function OverviewDueDatePage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [placedToday, setPlacedToday] = useState<{ total: number; shopee: number; tiktok: number }>();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState<ApiSyncSource | null>(null);
  const [syncProgress, setSyncProgress] = useState<OverviewSyncProgress | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [shopeeLinked, setShopeeLinked] = useState<boolean | null>(null);
  const [tiktokLinked, setTiktokLinked] = useState<boolean | null>(null);
  const [connectMsg, setConnectMsg] = useState("");
  const ordersRef = useRef<Order[]>([]);
  const dataGen = useRef(0);
  const syncLock = useRef(false);
  const autoSyncLock = useRef(false);
  const shopeeLinkedRef = useRef<boolean | null>(null);
  const tiktokLinkedRef = useRef<boolean | null>(null);
  const handleSyncApiRef = useRef<(
    source: ApiSyncSource,
    options?: { preserveIfEmpty?: boolean; silent?: boolean }
  ) => Promise<{ count: number; error?: string }>>();
  ordersRef.current = orders;
  shopeeLinkedRef.current = shopeeLinked;
  tiktokLinkedRef.current = tiktokLinked;
  const dayKeyRef = useRef(warehouseTodayKey());
  const cutoffKeyRef = useRef(indonesiaOrderCutoffKey());

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopee") === "connected") {
      setConnectMsg("Toko Shopee terhubung. Ambil data API untuk mengisi antrian.");
      setShopeeLinked(true);
    } else if (params.get("shopee") === "error") {
      setConnectMsg(
        toIndonesianError(params.get("message"), "Gagal menghubungkan Shopee")
      );
    }
    if (params.get("tiktok") === "connected") {
      setConnectMsg("Toko TikTok terhubung. Ambil data API untuk mengisi antrian.");
      setTiktokLinked(true);
    } else if (params.get("tiktok") === "error") {
      setConnectMsg(
        toIndonesianError(params.get("message"), "Gagal menghubungkan TikTok")
      );
    }
    if (params.has("shopee") || params.has("tiktok")) {
      params.delete("shopee");
      params.delete("tiktok");
      params.delete("message");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const loadLinks = async () => {
      const { shopee, tiktok } = await fetchMarketplaceTokenStatus();
      if (cancelled) return;
      const shopeeLinkedNow = isShopLinkedPayload(shopee);
      const tiktokLinkedNow = isShopLinkedPayload(tiktok);
      if (shopeeLinkedNow !== null) setShopeeLinked(shopeeLinkedNow);
      if (tiktokLinkedNow !== null) setTiktokLinked(tiktokLinkedNow);
    };

    void loadLinks();
    const onFocus = () => {
      void loadLinks();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, user]);

  const loadData = useCallback(async (mode: "init" | "refresh" = "refresh") => {
    const gen = ++dataGen.current;
    const apply = (data: DataSnapshot) => {
      if (gen !== dataGen.current) return;
      setOrders(data.orders);
      setUploadedFiles(data.files);
    };

    try {
      if (mode === "init") {
        const cached = getCachedOverview();
        if (cached) {
          apply(cached);
          setIsLoading(false);
          void loadOverviewData(true).then(apply).catch(() => {});
          return;
        }
      }

      let data = await loadOverviewData(true);
      if (data.orders.length === 0 && data.files.length === 0) {
        await migrateLegacyOverviewIfNeeded();
        data = await loadOverviewData(true);
      }
      apply(data);
      if (mode === "init") {
        try {
          const retain = await fetch("/api/overview/retain-today", { method: "POST" });
          if (retain.ok) {
            const retained = await loadOverviewData(true);
            if (gen === dataGen.current) apply(retained);
          }
        } catch {
          // Antrian hari ini tetap memakai data yang sudah ada.
        }
      }
    } catch (error) {
      console.error("Error loading overview data:", error);
    } finally {
      if (gen === dataGen.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    loadData("init");
  }, [authLoading, user, loadData]);

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
    } catch {
      // Kartu Order hari ini tetap 0 jika dashboard belum terisi.
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadPlacedToday();
  }, [authLoading, user, loadPlacedToday]);

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
      void loadData("refresh");
      void loadPlacedToday();
    };
    const timer = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, user, loadData, loadPlacedToday]);

  const applyLive = useCallback(async (current: Order[]) => {
    const liveOrders = current.filter(
      (order) =>
        order.platform === "tiktok" ||
        order.platform === "tokopedia" ||
        order.platform === "shopee" ||
        order.platform === "jubelio"
    );
    const numbers = uniqueLookupNumbers(liveOrders);
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
      const next = patched.map((order, index) =>
        order === current[index] ? current[index] : hydrateOrder(order)
      );
      const newlyCancelled = takeNewlyCancelled(current, next);
      if (newlyCancelled.length > 0) {
        const ids = newlyCancelled.map((order) => order.id);
        const numbers = newlyCancelled.map((order) => order.orderNumber).filter(Boolean);
        await fetch("/api/overview/kick-cancelled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, numbers }),
        }).catch(() => undefined);
      }
      const kept = dropCancelledOrders(next);
      const changed = kept.filter((order, index) => order !== current[index]);
      if (changed.length > 0) await upsertOverviewOrders(changed);
      return kept;
    } catch {
      return current;
    }
  }, []);

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

  const handleSyncApi = useCallback(async (
    source: ApiSyncSource,
    options?: { preserveIfEmpty?: boolean; silent?: boolean }
  ) => {
    const silent = Boolean(options?.silent);
    if (syncLock.current) {
      return {
        count: 0,
        error: silent
          ? undefined
          : autoSyncLock.current
            ? "Sedang sinkron otomatis. Tunggu sebentar, lalu ambil data lagi."
            : "Sedang mengambil data.",
      };
    }
    syncLock.current = true;
    if (!silent) {
      setSyncing(source);
      setSyncProgress(fetchProgress(source, 1, 0));
    }
    const label = sourceLabel(source);
    const platforms: Platform[] =
      source === "tiktok" ? ["tiktok", "tokopedia"] : [source];
    try {
      const collected: Order[] = [];
      let cursor: unknown;
      let insertedSoFar = 0;
      let startPage = 1;
      for (let page = 0; page < MAX_API_PAGES; page += 1) {
        if (!silent) setSyncProgress(fetchProgress(source, page + 1, collected.length));
        const res = await fetch(SYNC_URL[source], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persist: false, scope: "today", insertedSoFar, cursor, startPage }),
        });
        const text = await res.text();
        let data: {
          error?: string;
          done?: boolean;
          count?: number;
          nextPage?: number | null;
          cursor?: unknown;
          orders?: Order[];
        };
        try {
          data = JSON.parse(text);
        } catch {
          return {
            count: 0,
            error:
              res.status === 504 || res.status === 500
                ? "Pengambilan data terlalu lama. Coba lagi."
                : `Gagal mengambil data ${label}. Coba lagi.`,
          };
        }
        if (!res.ok) {
          return {
            count: 0,
            error: toIndonesianError(data.error, `Gagal mengambil data ${label}`),
          };
        }
        const batch = Array.isArray(data.orders) ? data.orders : [];
        collected.push(...batch.map(hydrateOrder).filter((order) => isShipTodayQueueOrder(order)));
        insertedSoFar = data.count || insertedSoFar + batch.length;
        if (!silent) setSyncProgress(fetchProgress(source, page + 1, collected.length));
        if (data.done) break;
        if (!data.nextPage && !data.cursor) break;
        startPage = data.nextPage || startPage;
        cursor = data.cursor;
      }

      const existingCount = ordersRef.current.filter((order) =>
        platforms.includes(order.platform)
      ).length;
      if (options?.preserveIfEmpty && collected.length === 0 && existingCount > 0) {
        return { count: existingCount };
      }

      if (!silent) {
        setSyncProgress({
          source,
          percent: 88,
          label: `Menyimpan antrian ${label}...`,
        });
      }
      const merged = mergeTodayQueueWithPickedUp(collected, ordersRef.current, platforms);
      const next = await replaceOverviewPlatforms(platforms, merged);
      dataGen.current += 1;
      setOrders(next.map(hydrateOrder));

      const fileMeta = SYNC_FILE[source];
      const uploadedFile: UploadedFile = {
        name: fileMeta.name,
        platform: fileMeta.platform,
        uploadedAt: new Date(),
        orderCount: merged.length,
      };
      await saveOverviewFile(uploadedFile);
      setUploadedFiles((prev) => [
        ...prev.filter((item) => item.name !== uploadedFile.name),
        uploadedFile,
      ]);
      if (!options?.preserveIfEmpty) {
        if (!silent) {
          setSyncProgress({
            source,
            percent: 96,
            label: "Mencocokkan cermin Jubelio...",
          });
        }
        try {
          const matchRes = await fetch("/api/overview/match-jubelio", { method: "POST" });
          const matchData = (await matchRes.json().catch(() => ({}))) as { found?: number };
          if ((matchData.found || 0) > 0) {
            await loadData("refresh");
          }
        } catch {
          // Cermin tetap memakai data yang baru ditarik.
        }
      }
      if (!silent) {
        setSyncProgress({
          source,
          percent: 100,
          label: `${collected.length.toLocaleString("id-ID")} pesanan ${label} siap.`,
        });
      }
      return { count: collected.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : null;
      return {
        count: 0,
        error: toIndonesianError(message, "Terjadi kesalahan jaringan"),
      };
    } finally {
      syncLock.current = false;
      if (!silent) {
        setSyncing(null);
        setSyncProgress(null);
      }
    }
  }, [loadData]);
  handleSyncApiRef.current = handleSyncApi;

  useEffect(() => {
    if (authLoading || !user || isLoading) return;
    let cancelled = false;
    let lastRun = 0;

    const run = async () => {
      const sync = handleSyncApiRef.current;
      if (!sync || cancelled || document.hidden || autoSyncLock.current) return;
      autoSyncLock.current = true;
      setAutoSyncing(true);
      lastRun = Date.now();
      try {
        for (let i = 0; i < 20 && (shopeeLinkedRef.current == null || tiktokLinkedRef.current == null); i += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (cancelled) return;
        }
        if (shopeeLinkedRef.current !== false) {
          await sync("shopee", { preserveIfEmpty: true, silent: true });
          if (cancelled) return;
        }
        if (tiktokLinkedRef.current !== false) {
          await sync("tiktok", { preserveIfEmpty: true, silent: true });
          if (cancelled) return;
        }
        await sync("jubelio", { preserveIfEmpty: true, silent: true });
        if (cancelled) return;
        try {
          const matchRes = await fetch("/api/overview/match-jubelio", { method: "POST" });
          const matchData = (await matchRes.json().catch(() => ({}))) as { found?: number };
          if (!cancelled && (matchData.found || 0) > 0) {
            await loadData("refresh");
          }
        } catch {
          // Antrian channel tetap dipakai meski lookup Jubelio gagal.
        }
      } finally {
        autoSyncLock.current = false;
        setAutoSyncing(false);
      }
    };

    const kick = () => {
      void run();
    };
    const start = window.setTimeout(kick, 800);
    const timer = window.setInterval(kick, AUTO_SYNC_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRun > 60_000) kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authLoading, user, isLoading, loadData]);

  useEffect(() => {
    if (authLoading || !user) return;
    let debounce: number | undefined;
    const reload = () => {
      if (syncLock.current) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (!syncLock.current) void loadData("refresh");
      }, 800);
    };
    const channel = supabase
      .channel("overview-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overview_orders" },
        reload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overview_files" },
        reload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_status" },
        reload
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeState("error");
        else if (status === "CLOSED") setRealtimeState("connecting");
      });
    return () => {
      window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user, loadData]);

  const handleClear = useCallback(async () => {
    dataGen.current += 1;
    await clearOverviewStore();
    setOrders([]);
    setUploadedFiles([]);
  }, []);

  const latestFile = (platforms: Platform[]) =>
    [...uploadedFiles]
      .filter((f) => platforms.includes(f.platform))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  const fileHint = (file?: UploadedFile) => {
    if (!file) return null;
    const fromApi = /API$/i.test(file.name);
    return fromApi
      ? `${file.orderCount} pesanan dari API`
      : `${file.orderCount} pesanan`;
  };
  const lastShopee = latestFile(["shopee"]);
  const lastTiktok = latestFile(["tiktok", "tokopedia"]);
  const lastJubelio = latestFile(["jubelio"]);

  if (!authLoading && !user) return null;

  if (authLoading || isLoading) {
    return <OverviewSkeleton />;
  }

  return (
    <DueDateOverviewView
      orders={orders}
      onSyncApi={handleSyncApi}
      syncing={syncing}
      syncProgress={syncProgress}
      autoSyncing={autoSyncing}
      realtimeState={realtimeState}
      shopeeLinked={shopeeLinked}
      tiktokLinked={tiktokLinked}
      connectMsg={connectMsg}
      onClear={handleClear}
      lastShopeeFile={fileHint(lastShopee)}
      lastTiktokFile={fileHint(lastTiktok)}
      lastJubelioFile={fileHint(lastJubelio)}
      onSignOut={signOut}
      workerName={profile?.name}
      placedToday={placedToday}
    />
  );
}
