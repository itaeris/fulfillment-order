import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-brand-200/70", className)} />;
}

export function TableSkeleton({
  rows = 8,
  columns = 6,
  showFilters = true,
  embedded = false,
}: {
  rows?: number;
  columns?: number;
  showFilters?: boolean;
  embedded?: boolean;
  delay?: number;
}) {
  const body = (
    <>
      {showFilters && (
        <div className="px-4 py-3 border-b border-brand-100 flex flex-wrap gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full ml-auto" />
        </div>
      )}
      <div className="px-4 py-3 bg-cream-100 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-cream-200">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="px-4 py-3.5 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn("h-4 flex-1", col === 0 && "max-w-[90px]", col === columns - 1 && "max-w-[60px]")}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );

  if (embedded) return <div className="overflow-hidden rounded-xl border border-brand-100">{body}</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
      {body}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number; delay?: number }) {
  return (
    <div className={cn(
      "grid gap-2 sm:gap-4",
      count > 4 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"
    )}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-brand-200 p-2.5 sm:p-4 space-y-2 sm:space-y-3"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden bg-cream-100">
      <aside className="hidden lg:flex w-[220px] bg-brand-900 flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-lg bg-brand-700" />
          <Skeleton className="h-4 w-28 bg-brand-700" />
        </div>
        <div className="px-5 py-4 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-2 w-16 bg-brand-800" />
            <Skeleton className="h-9 w-full rounded-lg bg-brand-800" />
            <Skeleton className="h-9 w-full rounded-lg bg-brand-800" />
            <Skeleton className="h-9 w-full rounded-lg bg-brand-800" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-2 w-12 bg-brand-800" />
            <Skeleton className="h-9 w-full rounded-lg bg-brand-800" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-brand-200 px-6 py-4 shrink-0">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-64" />
        </header>
        <main className="flex-1 overflow-hidden p-4 sm:p-6 space-y-4">
          <CardsSkeleton />
          <TableSkeleton rows={10} columns={7} />
        </main>
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream-100">
      <header className="bg-white border-b border-brand-200 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Skeleton className="h-5 w-36 sm:h-6 sm:w-44" />
            <Skeleton className="h-3 w-48 mt-2" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Skeleton className="hidden sm:block h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 sm:w-28 rounded-lg" />
            <Skeleton className="h-8 w-10 sm:w-20 rounded-lg" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-sm border border-brand-200 px-3 py-2.5 sm:px-4 sm:py-3 space-y-2"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <div className="px-3 sm:px-4 py-2.5 bg-cream-100 flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            <div className="divide-y divide-cream-200">
              {Array.from({ length: 6 }).map((_, row) => (
                <div key={row} className="px-3 sm:px-4 py-3 flex items-center gap-3">
                  {Array.from({ length: 6 }).map((_, col) => (
                    <Skeleton key={col} className={cn("h-4 flex-1", col === 0 && "max-w-[140px]")} />
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 p-3 sm:p-4 space-y-3">
            <Skeleton className="h-4 w-44" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-7 w-16 rounded-lg" />
                <Skeleton className="h-7 w-20 rounded-lg" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </div>
            <div className="px-3 sm:px-4 py-2.5 bg-cream-100 hidden md:flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            <div className="divide-y divide-cream-200">
              {Array.from({ length: 8 }).map((_, row) => (
                <div key={row} className="px-3 sm:px-4 py-3 flex items-center gap-3">
                  {Array.from({ length: 6 }).map((_, col) => (
                    <Skeleton key={col} className={cn("h-4 flex-1", col === 0 && "max-w-[120px]")} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
