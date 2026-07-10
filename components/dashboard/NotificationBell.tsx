"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/hooks/useNotifications";
import { VendorNotification } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: notifications = [], isLoading } = useNotifications({ limit: 5 });
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleClick = (notification: VendorNotification) => {
    if (!notification.isRead) markRead.mutate(notification.vendorNotificationId);
    const href = getNotificationHref(notification);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 w-[340px] max-h-[420px] overflow-hidden flex flex-col rounded-xl border border-border bg-white shadow-lg animate-in fade-in-0 zoom-in-95"
          sideOffset={8}
          align="end"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Loading…</p>
            )}
            {!isLoading && notifications.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No notifications yet for this company.
              </p>
            )}
            {notifications.map((n) => (
              <button
                key={n.vendorNotificationId}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors flex gap-2.5",
                  !n.isRead && "bg-primary/5"
                )}
              >
                {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                <div className={cn("min-w-0 flex-1", n.isRead && "pl-3.5")}>
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-sm text-primary font-medium px-4 py-2.5 hover:bg-muted/50 transition-colors border-t border-border shrink-0"
          >
            View all notifications
          </Link>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
