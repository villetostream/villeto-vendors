"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ClipboardList, Clock, CheckCircle2, MoreVertical } from "lucide-react";
import { useState, useEffect } from "react";
import { getVendorSummary } from "@/lib/api/vendor";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { useCompany } from "@/lib/hooks/useCompany";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/utils";
import { SummaryFilters } from "@/lib/types";

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
      <Link href={linkHref} className="text-xs text-primary hover:underline font-medium">
        View all
      </Link>
    </div>
  );
}

const RECENT_ORDERS_COLUMNS = ["PO Number", "Line Items", "Currency", "Total Amount", "Status", "Action"];

export default function DashboardPage() {
  const router = useRouter();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";
  const { activeCompany } = useCompany();

  // const dateRange = useCompanyStore((s) => s.dateRange);
  const [currency, setCurrency] = useState("NGN");

  const summaryFilters: SummaryFilters = {
    currency,
    // TODO: Uncomment when backend supports date filtering (currently causes 400 Bad Request)
    // ...(dateRange?.from && { startDate: format(dateRange.from, "yyyy-MM-dd") }),
    // ...(dateRange?.to && { endDate: format(dateRange.to, "yyyy-MM-dd") }),
  };

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.summary(companyId, summaryFilters),
    queryFn: () => getVendorSummary(summaryFilters),
    enabled: !!companyId,
  });

  const orders = summary?.recentOrders ?? [];

  // Fallback to update currency to the first order's currency if NGN is just a default
  // This is a UX fallback since vendor's preferred currency isn't saved yet
  useEffect(() => {
    if (orders.length > 0 && currency === "NGN" && orders[0].currency !== "NGN") {
      setCurrency(orders[0].currency);
    }
  }, [orders, currency]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back! Here&apos;s what&apos;s happening at{" "}
            <span className="font-medium text-foreground">
              {activeCompany?.companyName ?? "your company"}
            </span>
            .
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-9 w-[115px] bg-white whitespace-nowrap">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NGN">NGN (₦)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="GBP">GBP (£)</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild variant="primary">
            <Link href="/invoices/create">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Create new Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : summaryError ? (
        <div className="bg-white rounded-2xl border border-dashboard-border">
          <ErrorState
            message="Couldn't load your dashboard stats. Please try again."
            onRetry={() => refetchSummary()}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active POs"
            value={summary?.activePurchaseOrders ?? 0}
            icon={ClipboardList}
            iconBg="bg-blue-50 text-blue-600"
            linkHref="/orders"
          />
          <StatCard
            label="Invoices Under Review"
            value={summary?.invoicesUnderReview ?? 0}
            icon={Clock}
            iconBg="bg-purple-50 text-purple-600"
            linkHref="/invoices?status=under_review"
          />
          <StatCard
            label="Payments In Progress"
            value={summary?.paymentsInProgress ?? 0}
            icon={FilePlus2}
            iconBg="bg-amber-50 text-amber-600"
            linkHref="/invoices?paymentStatus=in_progress"
          />
          <StatCard
            label="Total Paid"
            value={formatCurrency(summary?.totalPaid ?? 0, currency)}
            icon={CheckCircle2}
            iconBg="bg-primary/10 text-primary"
            linkHref="/invoices?paymentStatus=paid"
          />
        </div>
      )}

      {/* Recent orders table */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dashboard-border">
          <h2 className="text-base font-semibold text-foreground">Recent Orders</h2>
          <Link href="/orders" className="text-sm text-primary hover:underline font-medium">
            View all
          </Link>
        </div>

        {summaryLoading ? (
          <TableSkeleton rows={5} columns={RECENT_ORDERS_COLUMNS.length} />
        ) : summaryError ? (
          <ErrorState message="Couldn't load recent orders. Please try again." onRetry={() => refetchSummary()} />
        ) : orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders assigned to you will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {RECENT_ORDERS_COLUMNS.map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr 
                    key={order.purchaseOrderId} 
                    onClick={() => router.push(`/orders/${order.purchaseOrderId}`)}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground">{order.poNumber}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{order.lineItemCount}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{order.currency}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <OrderStatusBadge status={order.status} />
                    </td>
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
      </div>
    </div>
  );
}
