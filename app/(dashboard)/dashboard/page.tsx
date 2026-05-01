"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ClipboardList, Clock, CheckCircle2 } from "lucide-react";
import { getDashboardStats } from "@/lib/api/vendor";
import { getOrders } from "@/lib/api/orders";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge, PriorityBadge } from "@/components/ui/StatusBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";

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
          <Icon className="h-4.5 w-4.5" size={18} />
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

export default function DashboardPage() {
  useAuthStore();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";
  const activeOrg = useOrgStore((s) => s.activeOrg);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.dashboardStats(orgId),
    queryFn: getDashboardStats,
    enabled: !!orgId,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: queryKeys.orders(orgId, { per_page: 6 }),
    queryFn: () => getOrders({ per_page: 6 }),
    enabled: !!orgId,
  });

  if (statsLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <Button asChild variant="primary">
          <Link href="/invoices/create">
            <FilePlus2 className="h-4 w-4" />
            Create new Invoice
          </Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active POs"
          value={stats?.active_pos ?? 20}
          icon={ClipboardList}
          iconBg="bg-blue-50 text-blue-600"
          linkHref="/orders"
        />
        <StatCard
          label="Invoices Under Review"
          value={stats?.invoices_under_review ?? 10}
          icon={Clock}
          iconBg="bg-purple-50 text-purple-600"
          linkHref="/invoices?status=under_review"
        />
        <StatCard
          label="Payments In Progress"
          value={stats?.payments_in_progress ?? 30}
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
          <div className="py-10 flex justify-center">
            <PageSpinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {["PO Number", "Organization", "Issue Date", "Priority", "Deadline", "Status", "Action"].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-left text-xs font-medium text-muted-foreground"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {(ordersData?.data ?? MOCK_ORDERS).map((order) => (
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
                        className="p-1.5 rounded-lg hover:bg-muted inline-flex transition-colors"
                      >
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
      </div>
    </div>
  );
}

// Mock data for UI before backend
const MOCK_ORDERS = [
  { id: "1", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "assigned" as const },
  { id: "2", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "medium" as const, deadline: "2025-09-26", status: "acknowledged" as const },
  { id: "3", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "ready_for_delivery" as const },
  { id: "4", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "delivered" as const },
  { id: "5", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "medium" as const, deadline: "2025-09-26", status: "invoiced" as const },
  { id: "6", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "urgent" as const, deadline: "2025-09-26", status: "invoiced" as const },
];
