"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CerminJubelioFullView from "@/components/CerminJubelioFullView";
import { OverviewSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedOverview, loadOverviewData } from "@/lib/client-data";
import { Order } from "@/types/order";

export default function CerminJubelioPage() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const loadData = useCallback(async () => {
    try {
      const cached = getCachedOverview();
      if (cached) {
        setOrders(cached.orders);
        setIsLoading(false);
        void loadOverviewData(true).then((data) => setOrders(data.orders)).catch(() => {});
        return;
      }
      const data = await loadOverviewData(true);
      setOrders(data.orders);
    } catch (error) {
      console.error("Error loading cermin data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadData();
  }, [authLoading, user, loadData]);

  if (!authLoading && !user) return null;
  if (authLoading || isLoading) return <OverviewSkeleton />;

  return (
    <CerminJubelioFullView
      orders={orders}
      onSignOut={signOut}
      workerName={profile?.name}
    />
  );
}
