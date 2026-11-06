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
 * A unified badge that combines the approval status and payment status into a single,
 * vendor-friendly state, removing the clunky two-badge UI.
 */
export function UnifiedInvoiceStatusBadge({
  invoice,
  className,
}: BadgeProps & { invoice: { status: InvoiceStatus; paymentStatus: InvoicePaymentStatus } }) {
  let label = "";
  let color = "";
  let bg = "";

  if (invoice.status === "rejected") {
    label = "Rejected";
    color = "text-red-700";
    bg = "bg-red-50 border-red-200";
  } else if (invoice.status === "paid" || invoice.paymentStatus === "paid") {
    label = "Paid";
    color = "text-green-700";
    bg = "bg-green-50 border-green-200";
  } else if (invoice.paymentStatus === "in_progress") {
    label = "Payment Processing";
    color = "text-blue-700";
    bg = "bg-blue-50 border-blue-200";
  } else if (invoice.status === "approved") {
    label = "Approved (Awaiting Payment)";
    color = "text-emerald-700";
    bg = "bg-emerald-50 border-emerald-200";
  } else if (invoice.status === "under_review") {
    label = "Under Review";
    color = "text-amber-700";
    bg = "bg-amber-50 border-amber-200";
  } else {
    label = "Submitted";
    color = "text-slate-700";
    bg = "bg-slate-50 border-slate-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        color,
        bg,
        className
      )}
    >
      {label}
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
    partially_dispatched:                { label: "Partially Fulfilled",              bg: "bg-blue-50",    color: "text-blue-700",    border: "border-blue-200" },
    dispatched:                          { label: "Fully Fulfilled",                  bg: "bg-green-50",   color: "text-green-700",   border: "border-green-200" },
    partially_received:                  { label: "Partially Received",               bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
    received:                            { label: "Fully Received",                   bg: "bg-teal-50",    color: "text-teal-700",    border: "border-teal-200" },
    ready:                               { label: "Fulfilled",                        bg: "bg-indigo-50",  color: "text-indigo-700",  border: "border-indigo-200" },
    not_delivered:                       { label: "Not Delivered",                    bg: "bg-slate-50",   color: "text-slate-600",   border: "border-slate-200" },
    partially_delivered:                 { label: "Partially Delivered",              bg: "bg-blue-50",    color: "text-blue-700",    border: "border-blue-200" },
    partial_delivery_with_exceptions:    { label: "Partially Delivered (Exceptions)", bg: "bg-amber-50",   color: "text-amber-800",   border: "border-amber-200" },
    partially_delivered_with_exceptions: { label: "Partially Delivered (Exceptions)", bg: "bg-amber-50",   color: "text-amber-800",   border: "border-amber-200" },
    fully_delivered:                     { label: "Fully Delivered",                  bg: "bg-teal-50",    color: "text-teal-700",    border: "border-teal-200" },
    delivered:                           { label: "Delivered",                        bg: "bg-teal-50",    color: "text-teal-700",    border: "border-teal-200" },
    delivered_with_exceptions:           { label: "Delivered (Exceptions)",           bg: "bg-amber-50",   color: "text-amber-800",   border: "border-amber-200" },
    full_delivery_with_exceptions:       { label: "Delivered (Exceptions)",           bg: "bg-amber-50",   color: "text-amber-800",   border: "border-amber-200" },
    confirmed:                           { label: "Confirmed",                        bg: "bg-green-50",   color: "text-green-700",   border: "border-green-200" },
    confirmed_with_exceptions:           { label: "Confirmed with Exceptions",        bg: "bg-amber-50",   color: "text-amber-800",   border: "border-amber-200" },
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

export function ExceptionResolutionBadge({
  status,
  className,
}: BadgeProps & { status?: string | null }) {
  if (!status || status === "not_required") return null;

  type StateConfig = { label: string; bg: string; color: string; border: string };
  const map: Record<string, StateConfig> = {
    awaiting_vendor_response:  { label: "Awaiting Vendor Response", bg: "bg-red-50",     color: "text-red-700",     border: "border-red-200" },
    backordered:               { label: "Backordered",              bg: "bg-[#f0faf8]",  color: "text-[#00b29a]",   border: "border-[#cbf0eb]" },
    forfeited:                 { label: "Forfeited",                bg: "bg-rose-50",    color: "text-rose-700",    border: "border-rose-200" },
    acknowledged:              { label: "Acknowledged",             bg: "bg-blue-50",    color: "text-blue-700",    border: "border-blue-200" },
    under_company_review:      { label: "Under Company Review",     bg: "bg-purple-50",  color: "text-purple-700",  border: "border-purple-200" },
    disputed:                  { label: "Disputed (Under Review)",  bg: "bg-purple-50",  color: "text-purple-700",  border: "border-purple-200" },
    resolved_after_dispute:    { label: "Resolved After Dispute",   bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
    resolved:                  { label: "Resolved",                 bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
    corrective_action_pending: { label: "Corrective Action Pending",bg: "bg-amber-50",   color: "text-amber-700",   border: "border-amber-200" },
  };

  const cfg = map[status] ?? {
    label: status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    bg: "bg-slate-50",
    color: "text-slate-700",
    border: "border-slate-200",
  };

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
      {cfg.label}
    </span>
  );
}
