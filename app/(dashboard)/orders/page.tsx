"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import { useDebounce } from "use-debounce";
import { useOrders } from "@/lib/hooks/useOrders";
import { useCompany } from "@/lib/hooks/useCompany";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { formatCurrency, cn } from "@/lib/utils";
import { OrderStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All Orders", value: "all" },
  { label: "Issued", value: "issued" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Ready for delivery", value: "ready_for_delivery" },
  { label: "Partially delivered", value: "partially_delivered" },
  { label: "Delivered", value: "delivered" },
  { label: "Closed", value: "closed" },
  // Display label reads "Withdrawn" — filter value stays "cancelled",
  // the backend value, unchanged. See ORDER_STATUS_DISPLAY_LABEL.
  { label: "Withdrawn", value: "cancelled" },
];

const ORDERS_COLUMNS = ["PO Number", "Line Items", "Currency", "Total Amount", "Status", "Action"];

const LIMIT_OPTIONS = [10, 20, 50];

export default function OrdersPage() {
  const router = useRouter();
  const { activeCompany } = useCompany();
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, limit]);

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    page,
    limit,
  };

  const { data, isLoading, isError, refetch, isFetching } = useOrders(filters);

  const orders = data ?? [];
  // NOTE: the list endpoint doesn't return a total count yet (flagged
  // with backend as an enhancement). Without it we can't render "Page X
  // of Y" or a real page-number control — only infer whether there's
  // likely a next page from whether this page came back full.
  const hasNextPage = orders.length === limit;

  // Client-side search — the endpoint doesn't take a `search` param yet,
  // so this only filters what's already on the current page, not across
  // the whole result set. Flag with backend if full-text search is needed.
  const visibleOrders = debouncedSearch
    ? orders.filter((o) => o.poNumber.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : orders;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Manage and track your purchase orders from{" "}
        <strong>{activeCompany?.companyName ?? "your company"}</strong>.
      </p>

      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pt-4 pb-3 border-b border-dashboard-border sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-0">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                aria-current={activeTab === tab.value ? "true" : undefined}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  activeTab === tab.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0 pb-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="order-search" className="sr-only">Search orders on this page</label>
              <input
                id="order-search"
                type="text"
                placeholder="Search this page..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={limit} columns={ORDERS_COLUMNS.length} />
        ) : isError ? (
          <ErrorState message="Couldn't load orders. Please check your connection and try again." onRetry={() => refetch()} />
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title={debouncedSearch || activeTab !== "all" ? "No matching orders" : "No orders yet"}
            description={
              debouncedSearch || activeTab !== "all"
                ? "Try adjusting your search or filter."
                : "Orders assigned to you will appear here."
            }
          />
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {ORDERS_COLUMNS.map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr 
                    key={order.purchaseOrderId} 
                    onClick={() => router.push(`/orders/${order.purchaseOrderId}`)}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold whitespace-nowrap">{order.poNumber}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{order.lineItemCount}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{order.currency}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </td>
                    <td className="px-5 py-3.5"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/orders/${order.purchaseOrderId}`}
                        aria-label={`View order ${order.poNumber}`}
                        className="p-1.5 rounded-lg hover:bg-muted inline-flex transition-colors"
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <div className="flex flex-col gap-3 px-5 py-3.5 border-t border-dashboard-border sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Page {page}</span>
              <label htmlFor="orders-per-page" className="sr-only">Results per page</label>
              <select
                id="orders-per-page"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-7 px-2 rounded-lg border border-border text-xs focus:outline-none"
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
            </div>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                aria-label="Next page"
                className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
