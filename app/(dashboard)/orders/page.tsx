"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Filter, ChevronDown, MoreVertical } from "lucide-react";
import { useDebounce } from "use-debounce";
import { useOrders } from "@/lib/hooks/useOrders";
import { useOrgStore } from "@/lib/stores/orgStore";
import { OrderStatusBadge, PriorityBadge } from "@/components/ui/StatusBadge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate, cn } from "@/lib/utils";
import { OrderStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All Orders", value: "all" },
  { label: "Assigned", value: "assigned" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Ready for delivery", value: "ready_for_delivery" },
  { label: "Invoiced", value: "invoiced" },
];

const ORDERS_COLUMNS = ["PO Number", "Organization", "Issue Date", "Priority", "Deadline", "Status", "Action"];

const PER_PAGE_OPTIONS = [4, 10, 25, 50];

export default function OrdersPage() {
  const activeOrg = useOrgStore((s) => s.activeOrg);
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(4);

  // Filter/tab/page-size changes should always reset back to page 1,
  // otherwise a user filtering down to fewer results can get stuck on a
  // page number that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, perPage]);

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    search: debouncedSearch || undefined,
    page,
    per_page: perPage,
  };

  const { data, isLoading, isError, refetch, isFetching } = useOrders(filters);

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold px-2">
          {total}
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Manage and track your purchase orders from{" "}
        <strong>{activeOrg?.name ?? "your organisation"}</strong>.
      </p>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        {/* Tabs + Search row */}
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
              <label htmlFor="order-search" className="sr-only">Search orders</label>
              <input
                id="order-search"
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-44"
              />
            </div>
            <button
              type="button"
              aria-label="Filter orders"
              className="h-9 px-3 rounded-xl border border-border text-sm text-muted-foreground flex items-center gap-1.5 hover:bg-muted transition-colors shrink-0"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Filter</span>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <TableSkeleton rows={perPage} columns={ORDERS_COLUMNS.length} />
        ) : isError ? (
          <ErrorState
            message="Couldn't load orders. Please check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : orders.length === 0 ? (
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
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold whitespace-nowrap">{order.po_number}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{order.organization}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(order.issue_date)}</td>
                    <td className="px-5 py-3.5"><PriorityBadge priority={order.priority} /></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(order.deadline)}</td>
                    <td className="px-5 py-3.5"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/orders/${order.id}`}
                        aria-label={`View order ${order.po_number}`}
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

        {/* Pagination */}
        {!isLoading && !isError && orders.length > 0 && (
          <div className="flex flex-col gap-3 px-5 py-3.5 border-t border-dashboard-border sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total} entries
              </span>
              <label htmlFor="orders-per-page" className="sr-only">Results per page</label>
              <select
                id="orders-per-page"
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="h-7 px-2 rounded-lg border border-border text-xs focus:outline-none"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
