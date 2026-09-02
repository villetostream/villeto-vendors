import { cn } from "@/lib/utils";
import {
  getOrderStatusConfig,
  getOrderPriorityConfig,
  getInvoiceStatusConfig,
  getInvoicePaymentStatusConfig,
  getCompanyStatusConfig,
} from "@/lib/utils";
import { FulfillmentDeliveryState, OrderStatus, OrderPriority, InvoiceStatus, InvoicePaymentStatus } from "@/lib/types";

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

const DELIVERY_STATUS_CONFIG: Record<FulfillmentDeliveryState, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not started", color: "text-gray-700", bg: "bg-gray-100" },
  ready: { label: "Ready for dispatch", color: "text-amber-700", bg: "bg-amber-50" },
  partially_dispatched: { label: "Partially dispatched", color: "text-blue-700", bg: "bg-blue-50" },
  dispatched: { label: "Dispatched — awaiting confirmation", color: "text-blue-700", bg: "bg-blue-50" },
  partially_received: { label: "Partially received", color: "text-amber-700", bg: "bg-amber-50" },
  received: { label: "Delivered", color: "text-emerald-700", bg: "bg-emerald-50" },
};

export function DeliveryStatusBadge({
  status,
  transportScope,
  className,
}: BadgeProps & {
  status: FulfillmentDeliveryState;
  transportScope?: "physical" | "non_physical" | "mixed" | "unknown";
}) {
  const cfg = DELIVERY_STATUS_CONFIG[status];
  const label =
    transportScope === "non_physical" && status === "partially_dispatched"
      ? "Partially fulfilled"
      : transportScope === "non_physical" && status === "dispatched"
        ? "Fulfilled — awaiting confirmation"
        : transportScope === "mixed" && status === "partially_dispatched"
          ? "Partially sent / fulfilled"
          : transportScope === "mixed" && status === "dispatched"
            ? "Sent / fulfilled — awaiting confirmation"
            : cfg.label;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        cfg.color,
        cfg.bg,
        className
      )}
    >
      {label}
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

export function InvoicePaymentStatusBadge({
  status,
  className,
}: BadgeProps & { status: InvoicePaymentStatus }) {
  const cfg = getInvoicePaymentStatusConfig(status);
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

/**
 * Company-relationship status — raw `status` string (backend casing is
 * inconsistent, normalized inside getCompanyStatusConfig) plus
 * approvalStatus, since the two together determine the copy shown (e.g.
 * "Setting up payments" for approved-but-not-yet-active). Never renders
 * "Banned" — see getCompanyStatusConfig for the vendor-facing copy choice.
 */
export function VendorStatusBadge({
  status,
  approvalStatus,
  className,
}: BadgeProps & { status: string; approvalStatus?: string | null }) {
  const cfg = getCompanyStatusConfig(status, approvalStatus);
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
