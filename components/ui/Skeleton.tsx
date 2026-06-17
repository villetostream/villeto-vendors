import { cn } from "@/lib/utils";

/** Base shimmer block — compose into shapes for specific skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-muted", className)}
      aria-hidden="true"
    />
  );
}

/** Matches the shape of the dashboard `StatCard` while stats are loading. */
export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-dashboard-border p-5">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="h-7 w-16 mb-3" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

/**
 * Matches the shape of an orders/invoices table while data is loading.
 * `columns` should match the number of header columns being skeletoned.
 */
export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      className="overflow-x-auto"
      role="status"
      aria-label="Loading table data"
    >
      <table className="w-full">
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-dashboard-border/60">
              {Array.from({ length: columns }, (_, colIndex) => (
                <td key={colIndex} className="px-5 py-3.5">
                  <Skeleton className={cn("h-4", colIndex === 0 ? "w-24" : "w-16")} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
