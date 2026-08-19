"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DueDateOverviewView from "@/components/DueDateOverview";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { parseExcelFile, detectPlatform } from "@/lib/excel-parser";
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
  loadOverviewData,
  type DataSnapshot,
} from "@/lib/client-data";
import { Order, Platform, UploadedFile } from "@/types/order";

function hydrateOrder(order: Order): Order {
  return {
    ...order,
    orderDate: new Date(order.orderDate),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime) : undefined,
  };
}

export default function OverviewDueDatePage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const ordersRef = useRef<Order[]>([]);
  const dataGen = useRef(0);
  ordersRef.current = orders;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

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

  const applyLive = useCallback(async (current: Order[]) => {
    const liveOrders = current.filter(
      (order) =>
        order.platform === "tiktok" ||
        order.platform === "tokopedia" ||
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

  const handleUploadExcel = useCallback(async (file: File, platform: Platform) => {
    const buffer = await file.arrayBuffer();
    const detected = detectPlatform(file.name);
    const guessed = detected !== "shopee" ? detected : platform;
    const parsedOrders = parseExcelFile(buffer, guessed).map(hydrateOrder);
    const actualPlatform = parsedOrders[0]?.platform || guessed;

    let finalOrders = parsedOrders;
    let matched: number | undefined;
    let apiError: string | undefined;
    let reconciled = false;

    if (parsedOrders.length > 0 && (actualPlatform === "tiktok" || actualPlatform === "tokopedia" || actualPlatform === "jubelio")) {
      try {
        const res = await fetch("/api/overview/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: actualPlatform,
            orders: parsedOrders.map((order) => ({
              ...order,
              orderDate: order.orderDate?.toISOString(),
              paidTime: order.paidTime?.toISOString(),
              shippedTime: order.shippedTime?.toISOString(),
              mustShipBefore: order.mustShipBefore?.toISOString(),
              pickupTime: order.pickupTime?.toISOString(),
            })),
          }),
        });
        const data = (await res.json()) as {
          orders?: Order[];
          matched?: number;
          error?: string;
        };
        if (Array.isArray(data.orders)) {
          finalOrders = data.orders.map(hydrateOrder);
          matched = data.matched;
          reconciled = true;
        }
        if (data.error) apiError = data.error;
      } catch {
        apiError = "Gagal mencocokkan data realtime. Pakai data Excel dulu.";
      }
    }

    const replacePlatforms: Platform[] =
      actualPlatform === "tiktok" || actualPlatform === "tokopedia"
        ? ["tiktok", "tokopedia"]
        : [actualPlatform];
    const next = await replaceOverviewPlatforms(replacePlatforms, finalOrders);
    dataGen.current += 1;
    setOrders(next.map(hydrateOrder));

    const uploadedFile: UploadedFile = {
      name: file.name,
      platform: actualPlatform,
      uploadedAt: new Date(),
      orderCount: finalOrders.length,
    };
    await saveOverviewFile(uploadedFile);
    setUploadedFiles((prev) => [...prev.filter((item) => item.name !== file.name), uploadedFile]);
    return {
      count: finalOrders.length,
      matched,
      platform: actualPlatform,
      reconciled,
      apiError,
    };
  }, []);

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
      : `${file.orderCount} pesanan dari Excel`;
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
      onUploadExcel={handleUploadExcel}
      onClear={handleClear}
      lastShopeeFile={fileHint(lastShopee)}
      lastTiktokFile={fileHint(lastTiktok)}
      lastJubelioFile={fileHint(lastJubelio)}
      onSignOut={signOut}
      workerName={profile?.name}
    />
  );
}
