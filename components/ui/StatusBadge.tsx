import { cn } from "@/lib/utils";
import {
  getOrderStatusConfig,
  getOrderPriorityConfig,
  getInvoiceStatusConfig,
  getVendorStatusConfig,
} from "@/lib/utils";
import { OrderStatus, OrderPriority, InvoiceStatus, VendorStatus } from "@/lib/types";

interface BadgeProps {
  className?: string;
}

export function OrderStatusBadge({
  status,
  className,
}: BadgeProps & { status: OrderStatus }) {
  const cfg = getOrderStatusConfig(status);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        cfg.color,
        cfg.bg,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: BadgeProps & { priority: OrderPriority }) {
  const cfg = getOrderPriorityConfig(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        cfg.color,
        cfg.bg,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export function InvoiceStatusBadge({
  status,
  className,
}: BadgeProps & { status: InvoiceStatus }) {
  const cfg = getInvoiceStatusConfig(status);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        cfg.color,
        cfg.bg,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export function VendorStatusBadge({
  status,
  className,
}: BadgeProps & { status: VendorStatus }) {
  const cfg = getVendorStatusConfig(status);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        cfg.color,
        cfg.bg,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}
