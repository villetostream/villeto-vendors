"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Filter, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrders } from "@/lib/api/orders";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { OrderStatusBadge, PriorityBadge } from "@/components/ui/StatusBadge";
import { PageSpinner, EmptyState } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { OrderStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All Orders", value: "all" },
  { label: "Assigned", value: "assigned" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Ready for delivery", value: "ready_for_delivery" },
  { label: "Invoiced", value: "invoiced" },
];

const PER_PAGE_OPTIONS = [4, 10, 25, 50];

export default function OrdersPage() {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(4);

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    search: search || undefined,
    page,
    per_page: perPage,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders(orgId, filters),
    queryFn: () => getOrders(filters),
    enabled: !!orgId,
  });

  const orders = data?.data ?? MOCK_ORDERS;
  const total = data?.total ?? MOCK_ORDERS.length;
  const totalPages = data?.total_pages ?? Math.ceil(total / perPage);

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
        <strong>Global Logistics Corp</strong>.
      </p>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        {/* Tabs + Search row */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 border-b border-dashboard-border gap-4">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setActiveTab(tab.value); setPage(1); }}
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-44"
              />
            </div>
            <button className="h-9 px-3 rounded-xl border border-border text-sm text-muted-foreground flex items-center gap-1.5 hover:bg-muted transition-colors">
              <Filter className="h-3.5 w-3.5" />
              Filter
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-10"><PageSpinner /></div>
        ) : orders.length === 0 ? (
          <EmptyState title="No orders found" description="Orders assigned to you will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {["PO Number", "Organization", "Issue Date", "Priority", "Deadline", "Status", "Action"].map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold">{order.po_number}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{order.organization}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(order.issue_date)}</td>
                    <td className="px-5 py-3.5"><PriorityBadge priority={order.priority} /></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(order.deadline)}</td>
                    <td className="px-5 py-3.5"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-5 py-3.5">
                      <Link href={`/orders/${order.id}`} className="p-1.5 rounded-lg hover:bg-muted inline-flex transition-colors">
                        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-dashboard-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Showing 1-{Math.min(perPage, orders.length)} of {total} entries</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="h-7 px-2 rounded-lg border border-border text-xs focus:outline-none"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "h-8 w-8 text-sm rounded-lg border transition-colors",
                  p === page
                    ? "border-primary bg-primary text-white"
                    : "border-border hover:bg-muted"
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCK_ORDERS = [
  { id: "1", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "assigned" as const },
  { id: "2", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "medium" as const, deadline: "2025-09-26", status: "acknowledged" as const },
  { id: "3", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "ready_for_delivery" as const },
  { id: "4", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "delivered" as const },
  { id: "5", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "medium" as const, deadline: "2025-09-26", status: "invoiced" as const },
];
