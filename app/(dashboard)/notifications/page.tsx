"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Bell, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/hooks/useNotifications";
import { VendorNotification } from "@/lib/types";
import { cn, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { TableSkeleton } from "@/components/ui/Skeleton";

/** Where a notification's metadata should deep-link to, by event type. */
function getNotificationHref(notification: VendorNotification): string | null {
  const purchaseOrderId = notification.metadata?.purchaseOrderId;
  const invoiceId = notification.metadata?.vendorInvoiceId ?? notification.metadata?.invoiceId;

  switch (notification.type) {
    case "purchase_order_issued":
      return purchaseOrderId ? `/orders/${purchaseOrderId}` : "/orders";
    case "invoice_under_review":
    case "invoice_approved":
    case "invoice_rejected":
    case "invoice_paid":
      return invoiceId ? `/invoices/${invoiceId}` : "/invoices";
    case "vendor_onboarding_approved":
    case "vendor_onboarding_rejected":
    case "vendor_account_activated":
    case "vendor_account_deactivated":
      return "/profile";
    default:
      return null;
  }
}

const LIMIT_OPTIONS = [20, 50, 100];

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filters = {
    page,
    limit,
    ...(filter === "unread" ? { isRead: false } : {}),
  };

  const { data: notifications = [], isLoading, isError, refetch } = useNotifications(filters);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // The backend currently doesn't return total counts for pagination.
  // Using the same convention as the orders list:
  const hasNextPage = notifications.length === limit;

  const handleClick = (notification: VendorNotification) => {
    if (!notification.isRead) markRead.mutate(notification.vendorNotificationId);
    const href = getNotificationHref(notification);
    if (href) router.push(href);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={() => router.back()} 
            aria-label="Go back" 
            className="p-1.5 rounded-xl hover:bg-muted transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount > 99 ? "99+" : unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stay updated on your purchase orders, invoices, and profile activity.
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        <div className="flex items-center gap-1 px-5 pt-4 pb-3 border-b border-dashboard-border overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setFilter("all"); setPage(1); }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              filter === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            All Notifications
          </button>
          <button
            onClick={() => { setFilter("unread"); setPage(1); }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-2",
              filter === "unread"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Unread
            {unreadCount > 0 && filter !== "unread" && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {isLoading ? (
          <TableSkeleton rows={limit > 10 ? 10 : limit} columns={1} />
        ) : isError ? (
          <ErrorState message="Couldn't load notifications. Please check your connection and try again." onRetry={() => refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            description={
              filter === "unread"
                ? "You're all caught up! There are no new notifications to show."
                : "Notifications about your activity will appear here."
            }
            icon={<Bell className="h-10 w-10 text-muted-foreground/50" />}
          />
        ) : (
          <div className="flex flex-col">
            {notifications.map((n) => (
              <button
                key={n.vendorNotificationId}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full text-left px-5 py-4 border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors flex gap-4 items-start",
                  !n.isRead && "bg-primary/5 hover:bg-primary/10"
                )}
              >
                <div className="mt-1">
                  {n.isRead ? (
                    <Bell className="h-5 w-5 text-muted-foreground/50" />
                  ) : (
                    <div className="relative">
                      <Bell className="h-5 w-5 text-primary" />
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 border border-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                    <p className={cn("text-base font-medium", n.isRead ? "text-foreground" : "text-foreground")}>
                      {n.title}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className={cn("text-sm mt-1", n.isRead ? "text-muted-foreground" : "text-foreground/90")}>
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!isLoading && !isError && notifications.length > 0 && (
          <div className="flex flex-col gap-3 px-5 py-3.5 border-t border-dashboard-border sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Page {page}</span>
              <label htmlFor="per-page" className="sr-only">Results per page</label>
              <select
                id="per-page"
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
