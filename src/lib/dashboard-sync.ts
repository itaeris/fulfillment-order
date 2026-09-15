import { POST as syncJubelio } from "@/app/api/jubelio/sync/route";
import { POST as syncShopee } from "@/app/api/shopee/sync/route";
import { POST as syncTiktok } from "@/app/api/tiktok/sync/route";

export type DashboardSyncSource = "shopee" | "tiktok" | "jubelio";

type SyncHandler = (request: Request) => Promise<Response>;

const HANDLER: Record<DashboardSyncSource, SyncHandler> = {
  shopee: syncShopee,
  tiktok: syncTiktok,
  jubelio: syncJubelio,
};

export type DashboardSyncResult = {
  source: DashboardSyncSource;
  count: number;
  done: boolean;
  partial?: boolean;
  error?: string;
};

export async function syncDashboardSource(
  source: DashboardSyncSource,
  budgetMs = 22_000
): Promise<DashboardSyncResult> {
  const started = Date.now();
  const handler = HANDLER[source];
  let startPage = 1;
  let insertedSoFar = 0;
  let cursor: unknown;
  let lastCount = 0;

  while (Date.now() - started < budgetMs) {
    const request = new Request("http://dashboard.local/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startPage, insertedSoFar, cursor }),
    });
    const response = await handler(request);
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      done?: boolean;
      count?: number;
      nextPage?: number | null;
      cursor?: unknown;
    };
    if (!response.ok) {
      return {
        source,
        count: lastCount,
        done: false,
        error: data.error || `Gagal mengambil data ${source}`,
      };
    }
    lastCount = data.count || lastCount;
    insertedSoFar = lastCount;
    if (data.done || (!data.nextPage && !data.cursor)) {
      return { source, count: lastCount, done: true };
    }
    startPage = data.nextPage || startPage;
    cursor = data.cursor;
  }

  return { source, count: lastCount, done: false, partial: true };
}
