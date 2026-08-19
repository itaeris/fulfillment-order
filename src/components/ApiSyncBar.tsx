"use client";

import { RefreshCw, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadedFile } from "@/types/order";

export type ApiSyncSource = "tiktok" | "jubelio";

export interface ApiSyncState {
  syncing: ApiSyncSource | null;
  syncError: string;
  syncErrorSource: ApiSyncSource | null;
  syncProgress: number;
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
  syncProgress,
  onSync,
  lastTiktokSync,
  lastJubelioSync,
  hint = "Cukup ambil data sekali. Yang sudah ada disimpan, sync berikutnya hanya yang berubah.",
  compact = false,
}: ApiSyncState & { hint?: string; compact?: boolean }) {
  const busy = !!syncing;
  const progressLabel =
    syncProgress > 0 ? `Mengambil data... ${syncProgress.toLocaleString("id-ID")}` : "Mengambil data...";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      {hint ? (
        <p className="hidden sm:block text-sm text-brand-400 max-w-xl">{hint}</p>
      ) : (
        <span className="hidden sm:block" />
      )}
      <div className="flex flex-col gap-1.5 w-full sm:w-auto sm:items-end sm:ml-auto">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            onClick={() => onSync("tiktok")}
            disabled={busy}
            className={cn(
              "flex items-center justify-center gap-1.5 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all",
              compact ? "px-2.5 py-2 sm:px-3 sm:py-1.5" : "px-3 py-2.5 sm:px-4 sm:py-2",
              "bg-brand-600"
            )}
          >
            <RefreshCw className={cn("w-4 h-4 shrink-0", syncing === "tiktok" && "animate-spin")} />
            <span className="truncate">
              {syncing === "tiktok" ? progressLabel : "Ambil TikTok"}
            </span>
          </button>
          <button
            onClick={() => onSync("jubelio")}
            disabled={busy}
            className={cn(
              "flex items-center justify-center gap-1.5 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-brand-900 disabled:opacity-50 transition-all",
              compact ? "px-2.5 py-2 sm:px-3 sm:py-1.5" : "px-3 py-2.5 sm:px-4 sm:py-2",
              "bg-brand-800"
            )}
          >
            <RefreshCw className={cn("w-4 h-4 shrink-0", syncing === "jubelio" && "animate-spin")} />
            <span className="truncate">
              {syncing === "jubelio" ? progressLabel : "Ambil Jubelio"}
            </span>
          </button>
        </div>
        {syncError ? (
          <span className="flex items-start gap-1 text-xs text-red-600">
            <CloudOff className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {syncError}
          </span>
        ) : (
          <span className="text-[11px] sm:text-xs text-brand-400 sm:text-right leading-snug">
            TikTok: {lastTiktokSync || "belum diambil"}
            <span className="hidden sm:inline"> · </span>
            <br className="sm:hidden" />
            Jubelio: {lastJubelioSync || "belum diambil"}
          </span>
        )}
      </div>
    </div>
  );
}
