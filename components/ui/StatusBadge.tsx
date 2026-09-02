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

export function DeliveryStatusBadge({
  status,
  transportScope,
  className,
}: BadgeProps & { status: string; transportScope?: string }) {

  type StateConfig = { label: string; bg: string; color: string; border: string };
  const stateMap: Record<string, StateConfig> = {
    partially_dispatched: { label: "Partially Fulfilled", bg: "bg-blue-50",    color: "text-blue-700",    border: "border-blue-200" },
    dispatched:           { label: "Fully Fulfilled",     bg: "bg-green-50",   color: "text-green-700",   border: "border-green-200" },
    partially_received:   { label: "Partially Received",  bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
    received:             { label: "Fully Received",       bg: "bg-teal-50",    color: "text-teal-700",    border: "border-teal-200" },
    ready:                { label: "Fulfilled",            bg: "bg-indigo-50",  color: "text-indigo-700",  border: "border-indigo-200" },
  };

  const cfg = stateMap[status] ?? {
    label: status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    bg: "bg-gray-50", color: "text-gray-700", border: "border-gray-200",
  };

  // Override label for non-physical (digital/service) deliveries
  let { label } = cfg;
  if (transportScope === "non_physical" && status === "dispatched") {
    label = "Provided";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        cfg.color,
        cfg.bg,
        cfg.border,
        className
      )}
    >
      {label}
    </span>
  );
}
