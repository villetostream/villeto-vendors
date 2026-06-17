"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ClipboardList, Clock, CheckCircle2, MoreVertical } from "lucide-react";
import { getDashboardStats } from "@/lib/api/vendor";
import { getOrders } from "@/lib/api/orders";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge, PriorityBadge } from "@/components/ui/StatusBadge";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { formatCurrency, formatDate } from "@/lib/utils";

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  linkHref,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  linkHref: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashboard-border p-5">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4.5 w-4.5" size={18} aria-hidden="true" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-3">{value}</p>
      <Link
        href={linkHref}
        className="text-xs text-primary hover:underline font-medium"
      >
        View all
      </Link>
    </div>
  );
}

const RECENT_ORDERS_COLUMNS = ["PO Number", "Organization", "Issue Date", "Priority", "Deadline", "Status", "Action"];

export default function DashboardPage() {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";
  const activeOrg = useOrgStore((s) => s.activeOrg);

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: queryKeys.dashboardStats(orgId),
    queryFn: getDashboardStats,
    enabled: !!orgId,
  });

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: queryKeys.orders(orgId, { per_page: 6 }),
    queryFn: () => getOrders({ per_page: 6 }),
    enabled: !!orgId,
  });

  const orders = ordersData?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back! Here&apos;s what&apos;s happening at{" "}
            <span className="font-medium text-foreground">
              {activeOrg?.name ?? "your organisation"}
            </span>
            .
          </p>
        </div>
        <Button asChild variant="primary" className="self-start sm:self-auto">
          <Link href="/invoices/create">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Create new Invoice
          </Link>
        </Button>
      </div>

      {/* Stats grid */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : statsError ? (
        <div className="bg-white rounded-2xl border border-dashboard-border">
          <ErrorState
            message="Couldn't load your dashboard stats. Please try again."
            onRetry={() => refetchStats()}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active POs"
            value={stats?.active_pos ?? 0}
            icon={ClipboardList}
            iconBg="bg-blue-50 text-blue-600"
            linkHref="/orders"
          />
          <StatCard
            label="Invoices Under Review"
            value={stats?.invoices_under_review ?? 0}
            icon={Clock}
            iconBg="bg-purple-50 text-purple-600"
            linkHref="/invoices?status=under_review"
          />
          <StatCard
            label="Payments In Progress"
            value={stats?.payments_in_progress ?? 0}
            icon={FilePlus2}
            iconBg="bg-amber-50 text-amber-600"
            linkHref="/invoices?status=approved"
          />
          <StatCard
            label="Total Paid"
            value={formatCurrency(stats?.total_paid ?? 0, stats?.currency ?? "NGN")}
            icon={CheckCircle2}
            iconBg="bg-primary/10 text-primary"
            linkHref="/invoices?status=paid"
          />
        </div>
      )}

      {/* Recent orders table */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dashboard-border">
          <h2 className="text-base font-semibold text-foreground">
            Recent Orders
          </h2>
          <Link href="/orders" className="text-sm text-primary hover:underline font-medium">
            View all
          </Link>
        </div>

        {ordersLoading ? (
          <TableSkeleton rows={5} columns={RECENT_ORDERS_COLUMNS.length} />
        ) : ordersError ? (
          <ErrorState
            message="Couldn't load recent orders. Please try again."
            onRetry={() => refetchOrders()}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders assigned to you will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {RECENT_ORDERS_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3 text-left text-xs font-medium text-muted-foreground"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground">
                      {order.po_number}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {order.organization}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {formatDate(order.issue_date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <PriorityBadge priority={order.priority} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {formatDate(order.deadline)}
                    </td>
                    <td className="px-5 py-3.5">
                      <OrderStatusBadge status={order.status} />
                    </td>
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
      </div>
    </div>
  );
}
