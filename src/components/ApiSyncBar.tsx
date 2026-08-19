"use client";

import { RefreshCw, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadedFile } from "@/types/order";

export type ApiSyncSource = "tiktok" | "jubelio";

export interface ApiSyncState {
  syncing: ApiSyncSource | null;
  syncError: string;
  onSync: (source: ApiSyncSource) => void;
  lastTiktokSync: string | null;
  lastJubelioSync: string | null;
  lastTiktokCount?: number;
  lastJubelioCount?: number;
}

function formatSyncAt(value?: Date | string) {
  if (!value) return null;
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getApiSyncLabels(uploadedFiles: UploadedFile[]) {
  const tiktok = [...uploadedFiles]
    .filter((f) => f.platform === "tiktok" || f.platform === "tokopedia")
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  const jubelio = [...uploadedFiles]
    .filter((f) => f.platform === "jubelio")
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

  return {
    lastTiktokSync: formatSyncAt(tiktok?.uploadedAt),
    lastJubelioSync: formatSyncAt(jubelio?.uploadedAt),
    lastTiktokCount: tiktok?.orderCount,
    lastJubelioCount: jubelio?.orderCount,
  };
}

export default function ApiSyncBar({
  syncing,
  syncError,
  onSync,
  lastTiktokSync,
  lastJubelioSync,
  hint = "Cukup ambil data sekali. Hasilnya sama di Pesanan, Komparasi, dan Settings.",
  compact = false,
}: ApiSyncState & { hint?: string; compact?: boolean }) {
  const busy = !!syncing;

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      {hint ? <p className="text-xs sm:text-sm text-brand-400 max-w-xl">{hint}</p> : <span />}
      <div className="flex flex-col items-end gap-1 ml-auto">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => onSync("tiktok")}
            disabled={busy}
            className={cn(
              "flex items-center gap-2 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all",
              compact ? "px-3 py-1.5" : "px-4 py-2",
              "bg-brand-600"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", syncing === "tiktok" && "animate-spin")} />
            {syncing === "tiktok" ? "Mengambil data..." : "Ambil data TikTok"}
          </button>
          <button
            onClick={() => onSync("jubelio")}
            disabled={busy}
            className={cn(
              "flex items-center gap-2 text-white rounded-lg text-sm font-medium hover:bg-brand-900 disabled:opacity-50 transition-all",
              compact ? "px-3 py-1.5" : "px-4 py-2",
              "bg-brand-800"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", syncing === "jubelio" && "animate-spin")} />
            {syncing === "jubelio" ? "Mengambil data..." : "Ambil data Jubelio"}
          </button>
        </div>
        {syncError ? (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <CloudOff className="w-3.5 h-3.5" /> {syncError}
          </span>
        ) : (
          <span className="text-xs text-brand-400 text-right">
            TikTok: {lastTiktokSync || "belum diambil"} · Jubelio: {lastJubelioSync || "belum diambil"}
          </span>
        )}
      </div>
    </div>
  );
}
