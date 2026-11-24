"use client";

import { PriceProposalDrawer } from "@/components/orders/PriceProposalDrawer";
import { PriceChangeHistorySection } from "@/components/orders/PriceChangeHistorySection";
import {
  usePriceChangeRequests,
  usePriceChangeEligibility,
  useWithdrawPriceProposal,
} from "@/lib/hooks/usePriceChanges";
import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  FilePlus2,
  Package,
  Truck,
  Send,
  Monitor,
  Wrench,
  AlertCircle,
  Clock,
  XCircle,
  ShieldAlert,
  Lock,
  Info,
  CircleDollarSign,
} from "lucide-react";
import {
  useOrder,
  useAcknowledgeOrder,
  useMarkReadyForDelivery,
  useCreateFulfillment,
  useDispatchFulfillment,
  useOrderFulfillmentExceptions,
  useResolveReceiptException,
  useAcceptFinalDecision,
} from "@/lib/hooks/useOrders";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge, DeliveryStatusBadge, ExceptionResolutionBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { DeliveryTypeMenu } from "@/components/orders/DeliveryTypeMenu";
import { FulfillmentModal, FulfillmentFormData } from "@/components/orders/FulfillmentModal";
import { ItemFulfillmentDrawer } from "@/components/orders/ItemFulfillmentDrawer";
import {
  ResolutionModal,
  getLineUnresolvedQty,
  getLineContestedDisputeQty,
  getLineAllocatedQty,
  isLineAlreadyResolved,
  getLineRecommendedDisposition,
} from "@/components/orders/ResolutionModal";
import { EvidenceGallery } from "@/components/orders/EvidenceGallery";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import { formatCurrency, formatDate, formatDateTime, parseLocalDate, isPastCalendarDate, resolveAcknowledgePromiseDate, parseExceptionReason, formatExceptionReason, getUniqueLineReasons, enrichFulfillmentsWithReceipts, formatQtyWithUom, pluralizeUnits, cn } from "@/lib/utils";
import {
  buildCreateFulfillmentPayload,
  validateFulfillmentDeliveryDetails,
} from "@/lib/utils/fulfillment";
import { format } from "date-fns";
import {
  Fulfillment,
  FulfillmentExceptionDetail,
  DeliveryType,
  TimelineEvent,
  OrderLineItem,
  UnifiedResolutionPayload,
  VendorResolutionAction,
  LineItemResolution,
} from "@/lib/types";
import { toast } from "sonner";

function OrderDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

// ── Per-line exception breakdown ──
// Shows each affected item with its own rejected/missing counts and its own
// reason, so the vendor never has to guess which reason belongs to which item.
// Defaults to showing the first item when multiple items exist, with an expandable toggle.
function ExceptionBreakdown({
  fulfillment,
  className,
  initialVisible = 1,
  unresolvedOnly = false,
  local,
}: {
  fulfillment: Fulfillment;
  className?: string;
  initialVisible?: number;
  unresolvedOnly?: boolean;
  local?: any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const rows = (fulfillment.lineItems || [])
    .filter((li) => (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0)
    .filter((li) => {
      if (!unresolvedOnly) return true;
      return !isLineAlreadyResolved(li as any, fulfillment);
    })
    .map((li) => {
      const parsed = parseExceptionReason(li.exceptionReason || li.rejectionReason || "");
      const excQty = (li.quantityRejected || 0) + (li.quantityMissing || 0);
      const unresolvedQty = getLineUnresolvedQty(li as any, fulfillment);
      const contestedQty = getLineContestedDisputeQty(li as any, fulfillment);
      const allocated = getLineAllocatedQty(li as any, fulfillment);
      const rec = getLineRecommendedDisposition(li as any, fulfillment);
      return { li, parsed, excQty, unresolvedQty, contestedQty, allocated, rec };
    })
    .sort((a, b) => {
      if (a.unresolvedQty > 0 && b.unresolvedQty === 0) return -1;
      if (a.unresolvedQty === 0 && b.unresolvedQty > 0) return 1;
      return 0;
    });

  if (rows.length === 0) {
    const fallback = parseExceptionReason(fulfillment.rejectionReason || "");
    if (!fallback.category && !fallback.text) return null;
    return (
      <p className={cn("text-xs text-red-800 break-words", className)}>
        <span className="font-semibold">Reason: </span>
        {formatExceptionReason(fulfillment.rejectionReason || "")}
      </p>
    );
  }

  const threshold = Math.max(initialVisible, 2);
  const hasHidden = rows.length > threshold;
  const visibleRows = isExpanded || !hasHidden ? rows : rows.slice(0, threshold);
  const hiddenCount = rows.length - threshold;

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      {visibleRows.map(({ li, parsed, excQty, unresolvedQty, contestedQty, allocated, rec }) => {
        const rejected = li.quantityRejected || 0;
        const missing = li.quantityMissing || 0;
        const counts = [
          rejected > 0 ? `${rejected} rejected` : null,
          missing > 0 ? `${missing} missing` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const isResolved =
          unresolvedQty === 0 && (allocated.total > 0 || li.finalQuantityAccepted != null);

        return (
          <div
            key={li.purchaseOrderLineItemId}
            className={cn(
              "rounded-lg px-3 py-2 min-w-0 border transition-all",
              isResolved
                ? "bg-emerald-50/70 border-emerald-200/80"
                : "bg-white/80 border-red-200/80"
            )}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground break-words">{li.name}</span>
              <span className="text-[11px] font-medium text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded-md border border-border">
                {counts}
              </span>
              {unresolvedQty > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-md">
                  {unresolvedQty} Pending Resolution
                </span>
              )}
              {contestedQty > 0 && (
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded-md">
                  {contestedQty} Disputed (Buyer Review)
                </span>
              )}
              {rec && !isResolved && (
                <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                  <span>Buyer suggests:</span>
                  <span className="font-bold capitalize">{rec === "forfeit" ? "Forfeit (write off)" : "Backorder (replace)"}</span>
                </span>
              )}
              {isResolved && (
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                  ✓ Resolved
                  {allocated.total > 0
                    ? ` (${allocated.backorder > 0 ? `${allocated.backorder} Backorder` : ""}${
                        allocated.backorder > 0 && allocated.forfeit > 0 ? ", " : ""
                      }${allocated.forfeit > 0 ? `${allocated.forfeit} Forfeit` : ""})`
                    : ""}
                </span>
              )}
              {parsed.categories?.map((cat, i) => (
                <span
                  key={i}
                  className="text-[10px] font-semibold bg-red-100 text-red-900 px-1.5 py-0.5 rounded-md border border-red-200"
                >
                  {cat}
                </span>
              ))}
            </div>
            {parsed.text && (
              <div className="mt-1">
                <ExpandableText
                  text={parsed.text}
                  maxLength={120}
                  className="text-xs text-foreground/80 leading-relaxed break-words"
                />
              </div>
            )}
            {!parsed.text && !parsed.category && (
              <p className="text-xs text-muted-foreground mt-1 italic">No reason provided by buyer</p>
            )}
          </div>
        );
      })}

      {hasHidden && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white/90 hover:bg-white transition-all py-1.5 px-3 rounded-lg border border-slate-200/90 shadow-xs cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span>Show fewer items</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span>
                  Show all {rows.length} affected items
                  <span className="font-normal text-muted-foreground ml-1">
                    (+{hiddenCount} more: {rows.slice(threshold).map((r) => r.li.name).join(", ")})
                  </span>
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function DisputeNotesList({
  items,
  fallbackNote,
}: {
  items: Fulfillment["lineItems"];
  fallbackNote?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Collect items that were disputed or have a recorded vendor response reason
  const disputedItems = (items || []).filter(
    (li) =>
      li.vendorDisposition === "dispute" ||
      li.resolutionStatus === "under_company_review" ||
      li.resolutionStatus === "disputed" ||
      Boolean(li.vendorResponseReason)
  );

  // If no individual line has a reason or disposition, fall back to notice-level vendorResponseReason
  if (disputedItems.length === 0) {
    if (!fallbackNote) return null;
    return (
      <p className="text-purple-800 pl-5.5 text-xs">
        <span className="font-semibold">Your dispute note: </span>
        <span className="italic">&ldquo;{fallbackNote}&rdquo;</span>
      </p>
    );
  }

  // Exactly 1 disputed item
  if (disputedItems.length === 1) {
    const item = disputedItems[0];
    const qty = (item.quantityRejected || 0) + (item.quantityMissing || 0);
    const reason = item.vendorResponseReason || fallbackNote;
    return (
      <div className="pl-5.5 text-xs text-purple-900">
        <span className="font-semibold text-purple-950">Your dispute note: </span>
        <span className="font-semibold text-purple-950">{item.name}{qty > 0 ? ` (${pluralizeUnits(qty)})` : ""}: </span>
        <span className="italic text-purple-800">&ldquo;{reason}&rdquo;</span>
      </div>
    );
  }

  // Multiple disputed items: show 2 by default, collapse the rest
  const initialVisible = 2;
  const hasHidden = disputedItems.length > initialVisible;
  const visibleItems = isExpanded ? disputedItems : disputedItems.slice(0, initialVisible);
  const hiddenCount = disputedItems.length - initialVisible;

  return (
    <div className="pl-5.5 space-y-1.5 pt-0.5 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-purple-950">
          Dispute notes ({disputedItems.length} items):
        </span>
        {hasHidden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="text-[11px] font-semibold text-purple-800 hover:text-purple-950 underline inline-flex items-center gap-0.5 cursor-pointer"
          >
            {isExpanded ? (
              <>
                Show fewer items <ChevronUp className="h-3 w-3 shrink-0" />
              </>
            ) : (
              <>
                Show all {disputedItems.length} items <ChevronDown className="h-3 w-3 shrink-0" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {visibleItems.map((item, idx) => {
          const qty = (item.quantityRejected || 0) + (item.quantityMissing || 0);
          const reason = item.vendorResponseReason || fallbackNote;
          return (
            <div
              key={item.purchaseOrderLineItemId || idx}
              className="px-2.5 py-1.5 rounded-lg bg-purple-100/70 border border-purple-200/80 text-xs text-purple-900 flex items-start gap-1.5"
            >
              <span className="font-semibold text-purple-950 shrink-0">
                {item.name}{qty > 0 ? ` (${pluralizeUnits(qty)})` : ""}:
              </span>
              <span className="italic text-purple-800 break-words">
                &ldquo;{reason}&rdquo;
              </span>
            </div>
          );
        })}
      </div>

      {!isExpanded && hasHidden && (
        <p className="text-[11px] text-purple-700/90 italic">
          +{hiddenCount} more disputed item{hiddenCount > 1 ? "s" : ""} ({disputedItems.slice(initialVisible).map((i) => i.name).join(", ")})
        </p>
      )}
    </div>
  );
}

function formatFinalDecisionLabel(decision?: string | null): string {
  switch (decision) {
    case "uphold_buyer_finding":
      return "Buyer Finding Upheld";
    case "accept_vendor_dispute":
      return "Your Dispute Accepted";
    case "revise_buyer_finding":
      return "Buyer Finding Revised";
    default:
      return "Resolved";
  }
}

function isLineExceptionUnresolved(
  li: Fulfillment["lineItems"][number],
  local?: { itemResolutions?: Record<string, LineItemResolution> },
  notice?: Fulfillment
): boolean {
  if (local?.itemResolutions?.[li.purchaseOrderLineItemId]) return false;
  return !isLineAlreadyResolved(li, notice);
}

export type ExplicitDeliveryState =
  | "submitted"
  | "awaiting_receipt"
  | "partially_received"
  | "received"
  | "disputed"
  | "cancelled"
  | "final_decision_received"
  | "resolved_after_dispute"
  | "action_required";

/**
 * Derives the explicit 6-state delivery lifecycle status for a single fulfillment:
 * - "cancelled": Shipment was cancelled
 * - "submitted": Vendor submitted shipment details; physical goods still awaiting dispatch
 * - "disputed": Company identified a discrepancy (awaiting vendor response or under company review)
 * - "awaiting_receipt": Dispatched (or non-physical submitted), awaiting company inspection & confirmation
 * - "partially_received": Company confirmed fewer units than shipped (and discrepancy is addressed/acknowledged)
 * - "received": Company confirmed all shipped units
 */
function deriveFulfillmentExplicitState(
  notice: Fulfillment,
  local?: {
    status?: "acknowledged" | "disputed" | "mixed";
    action?: string;
    type?: string;
    itemResolutions?: Record<string, LineItemResolution>;
  }
): {
  state: ExplicitDeliveryState;
  label: string;
  badgeCls: string;
  totalShipped: number;
  totalAccepted: number;
  totalExceptionUnits: number;
  isVendorActionRequired: boolean;
  isCompanyActionRequired: boolean;
  isResolvedAfterDispute: boolean;
} {
  const method = notice.fulfillmentMethod || "unknown";
  const isPhysical =
    ["carrier", "vendor_truck"].includes(method) ||
    notice.lineItems.some((li) =>
      ["carrier", "vendor_truck"].includes(li.fulfillmentMethod || "")
    );

  const totalShipped =
    notice.totalDeliveredQuantity ??
    notice.lineItems.reduce(
      (sum, li) =>
        sum +
        ((li.quantityAccepted || 0) + (li.quantityRejected || 0) + (li.quantityMissing || 0) ||
          li.quantityReady ||
          li.quantityShipped ||
          0),
      0
    );

  const unresolvedNoticeUnits = notice.lineItems.reduce(
    (sum, li) => sum + getLineUnresolvedQty(li as any, notice),
    0
  );

  const hasFinalDecision = notice.finalDecision != null;
  const isResolvedAfterDispute =
    notice.resolutionStatus === "resolved_after_dispute" ||
    (hasFinalDecision &&
      (notice.resolutionStatus === "resolved" ||
        notice.resolutionStatus === "backordered" ||
        notice.resolutionStatus === "forfeited" ||
        notice.finalDecision === "accept_vendor_dispute" ||
        (unresolvedNoticeUnits === 0 && !notice.vendorActionRequired) ||
        (notice.vendorActionRequired === false &&
          (notice as any).vendorResponse === "acknowledged")));

  const isFinalDecisionPending =
    hasFinalDecision &&
    !isResolvedAfterDispute &&
    (notice.resolutionStatus === "awaiting_vendor_disposition" ||
      notice.vendorActionRequired === true ||
      unresolvedNoticeUnits > 0);

  const totalAccepted =
    notice.totalAcceptedQuantity ??
    notice.lineItems.reduce((sum, li) => {
      const hasFinal =
        isResolvedAfterDispute ||
        li.resolutionStatus === "resolved_after_dispute" ||
        li.finalQuantityAccepted != null;
      const acc = hasFinal
        ? li.finalQuantityAccepted ?? li.quantityAccepted ?? li.quantityReceived ?? 0
        : li.quantityAccepted ?? li.quantityReceived ?? 0;
      return sum + acc;
    }, 0);

  const totalMissing =
    notice.totalMissingQuantity ??
    notice.lineItems.reduce((sum, li) => sum + (li.quantityMissing || 0), 0);

  let totalRejected =
    notice.totalRejectedQuantity ??
    notice.lineItems.reduce((sum, li) => sum + (li.quantityRejected || 0), 0);

  if (
    !totalRejected &&
    !totalMissing &&
    (notice.inspectionOutcome === "accepted_with_exceptions" ||
      notice.inspectionOutcome === "rejected" ||
      notice.confirmationOutcome === "confirmed_with_exceptions")
  ) {
    totalRejected = Math.max(0, totalShipped - totalAccepted);
  }

  const totalExceptionUnits = totalRejected + totalMissing;

  const totalAwaitingOnLines = notice.lineItems.reduce(
    (sum, li) => sum + (li.quantityAwaitingReceipt || 0),
    0
  );

  const hasBuyerReceiptDecision =
    !!notice.deliveryReceiptId ||
    !!notice.receiptNumber ||
    isResolvedAfterDispute ||
    notice.status === "confirmed" ||
    notice.status === "confirmed_with_exceptions" ||
    notice.confirmationOutcome === "confirmed" ||
    notice.confirmationOutcome === "confirmed_with_exceptions" ||
    (!!notice.inspectionOutcome && notice.inspectionOutcome !== "awaiting_inspection") ||
    notice.resolutionStatus === "acknowledged" ||
    notice.resolutionStatus === "backordered" ||
    notice.resolutionStatus === "forfeited" ||
    notice.resolutionStatus === "resolved" ||
    !!local ||
    (totalAccepted > 0 && totalAwaitingOnLines === 0);

  const hasUnresolvedLineItems =
    hasBuyerReceiptDecision &&
    notice.lineItems.some((li) => isLineExceptionUnresolved(li, local, notice));

  const isCompanyActionRequired =
    hasBuyerReceiptDecision &&
    !hasFinalDecision &&
    !isResolvedAfterDispute &&
    (notice.companyActionRequired === true ||
      notice.resolutionStatus === "under_company_review" ||
      local?.status === "disputed");

  const isVendorActionRequired =
    hasBuyerReceiptDecision &&
    !hasFinalDecision &&
    !isResolvedAfterDispute &&
    (hasUnresolvedLineItems ||
      (!local &&
        (notice.vendorActionRequired === true ||
          (notice.vendorActionRequired !== false &&
            (notice.resolutionStatus === "awaiting_vendor_response" ||
              (!notice.resolutionStatus &&
                (notice.inspectionOutcome === "accepted_with_exceptions" ||
                  notice.inspectionOutcome === "rejected" ||
                  notice.confirmationOutcome === "confirmed_with_exceptions" ||
                  totalExceptionUnits > 0)))))));

  if (notice.status === "cancelled") {
    return {
      state: "cancelled",
      label: "Cancelled",
      badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: false,
      isCompanyActionRequired: false,
      isResolvedAfterDispute,
    };
  }

  if (isPhysical && notice.dispatchStatus !== "dispatched") {
    return {
      state: "submitted",
      label: "Submitted · Awaiting Dispatch",
      badgeCls: "bg-amber-50 text-amber-800 border-amber-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: false,
      isCompanyActionRequired: false,
      isResolvedAfterDispute,
    };
  }

  if (!hasBuyerReceiptDecision) {
    return {
      state: "awaiting_receipt",
      label: "Awaiting Receipt",
      badgeCls: "bg-blue-50 text-blue-700 border-blue-200",
      totalShipped,
      totalAccepted: 0,
      totalExceptionUnits: 0,
      isVendorActionRequired: false,
      isCompanyActionRequired: false,
      isResolvedAfterDispute: false,
    };
  }

  if (isFinalDecisionPending) {
    return {
      state: "final_decision_received",
      label: `Final Decision: ${formatFinalDecisionLabel(notice.finalDecision)} · Allocation Required`,
      badgeCls: "bg-amber-50 text-amber-900 border-amber-300",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: true,
      isCompanyActionRequired: false,
      isResolvedAfterDispute: false,
    };
  }

  if (isResolvedAfterDispute) {
    return {
      state: "resolved_after_dispute",
      label: `Dispute Resolved · ${formatFinalDecisionLabel(notice.finalDecision)}`,
      badgeCls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: false,
      isCompanyActionRequired: false,
      isResolvedAfterDispute: true,
    };
  }

  if (isCompanyActionRequired) {
    return {
      state: "disputed",
      label: "Disputed · Under Review",
      badgeCls: "bg-purple-50 text-purple-700 border-purple-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: false,
      isCompanyActionRequired: true,
      isResolvedAfterDispute: false,
    };
  }

  if (isVendorActionRequired) {
    return {
      state: "action_required",
      label: "Action Required",
      badgeCls: "bg-red-50 text-red-700 border-red-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired: true,
      isCompanyActionRequired: false,
      isResolvedAfterDispute: false,
    };
  }

  if (totalAccepted < totalShipped) {
    return {
      state: "partially_received",
      label: `Partially Received (${totalAccepted}/${totalShipped})`,
      badgeCls: "bg-teal-50 text-teal-800 border-teal-200",
      totalShipped,
      totalAccepted,
      totalExceptionUnits,
      isVendorActionRequired,
      isCompanyActionRequired,
      isResolvedAfterDispute,
    };
  }

  return {
    state: "received",
    label: "Received",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    totalShipped,
    totalAccepted,
    totalExceptionUnits,
    isVendorActionRequired,
    isCompanyActionRequired,
    isResolvedAfterDispute,
  };
}

// ── Fulfillment History Card ──
function FulfillmentHistorySection({
  notices,
  orderLineItems = [],
  onDispatch,
  isDispatching,
  localResolutions = {},
  onOpenResolution,
  onOpenFinalDecision,
}: {
  notices: Fulfillment[];
  orderLineItems?: OrderLineItem[];
  onDispatch: (fulfillmentId: string) => void;
  isDispatching: (fulfillmentId: string) => boolean;
  localResolutions?: Record<string, any>;
  onOpenResolution: (
    notice: Fulfillment,
    index: number,
    targetItemId?: string | null,
    initialAction?: VendorResolutionAction
  ) => void;
  onOpenFinalDecision?: (notice: Fulfillment, index: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDispatchId, setConfirmDispatchId] = useState<string | null>(null);

  // Automatically expand the latest shipment that needs physical dispatch or vendor exception resolution
  useEffect(() => {
    if (!notices || notices.length === 0) return;
    const actionTarget = [...notices].reverse().find((n) => {
      const info = deriveFulfillmentExplicitState(n, localResolutions[n.vendorDeliveryNoticeId]);
      return info.state === "submitted" || info.isVendorActionRequired;
    });
    if (actionTarget) {
      setExpandedId((prev) => prev ?? actionTarget.vendorDeliveryNoticeId);
    }
  }, [notices, localResolutions]);

  if (!notices || notices.length === 0) return null;

  const methodLabel: Record<string, string> = {
    carrier: "Carrier",
    vendor_truck: "Vendor Truck",
    digital: "Digital",
    service: "Service",
    mixed: "Mixed Methods",
  };

  return (
    <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">
          Fulfillment History <span className="text-muted-foreground font-normal ml-1">{notices.length}</span>
        </h2>
      </div>
      <div className="divide-y divide-border">
        {notices.map((notice, idx) => {
          const isExpanded = expandedId === notice.vendorDeliveryNoticeId;
          const lineMethods = Array.from(
            new Set(
              notice.lineItems
                .map((li) => (li.fulfillmentMethod ? String(li.fulfillmentMethod) : null))
                .filter((m): m is string => Boolean(m))
            )
          );
          const method: string =
            notice.fulfillmentMethod ||
            (lineMethods.length === 1
              ? lineMethods[0]
              : lineMethods.length > 1
              ? "mixed"
              : "unknown");
          const isPhysical =
            ["carrier", "vendor_truck"].includes(method) ||
            notice.lineItems.some((li) =>
              li.fulfillmentMethod ? ["carrier", "vendor_truck"].includes(String(li.fulfillmentMethod)) : false
            );
          
          let titlePrefix = "Fulfillment";
          let Icon = Package;
          if (isPhysical) {
            titlePrefix = "Shipment";
            Icon = Truck;
          } else if (method === "digital") {
            titlePrefix = "Digital Delivery";
            Icon = Monitor;
          } else if (method === "service") {
            titlePrefix = "Service Delivery";
            Icon = Wrench;
          }

          // Per-fulfillment exception calculations (rejected + missing)
          const local = localResolutions[notice.vendorDeliveryNoticeId];
          const totalDelivered =
            notice.totalDeliveredQuantity ??
            notice.lineItems.reduce(
              (sum, li) =>
                sum +
                ((li.quantityAccepted || 0) + (li.quantityRejected || 0) + (li.quantityMissing || 0) ||
                  li.quantityReady ||
                  li.quantityShipped ||
                  0),
              0
            );
          const totalAccepted =
            notice.totalAcceptedQuantity ??
            notice.lineItems.reduce(
              (sum, li) => sum + (li.quantityAccepted ?? li.quantityReceived ?? 0),
              0
            );
          const totalMissing =
            notice.totalMissingQuantity ??
            notice.lineItems.reduce((sum, li) => sum + (li.quantityMissing || 0), 0);
          let totalRejected =
            notice.totalRejectedQuantity ??
            notice.lineItems.reduce((sum, li) => sum + (li.quantityRejected || 0), 0);

          if (
            !totalRejected &&
            !totalMissing &&
            (notice.inspectionOutcome === "accepted_with_exceptions" ||
              notice.inspectionOutcome === "rejected" ||
              notice.confirmationOutcome === "confirmed_with_exceptions")
          ) {
            totalRejected = Math.max(0, totalDelivered - totalAccepted);
          }

          const totalExceptionUnits = totalRejected + totalMissing;
          const unresolvedNoticeUnits = notice.lineItems.reduce(
            (sum, li) => sum + getLineUnresolvedQty(li as any, notice),
            0
          );

          const explicitInfo = deriveFulfillmentExplicitState(notice, local);
          const isResolvedAfterDispute = explicitInfo.isResolvedAfterDispute;
          const isCompanyActionRequired = explicitInfo.isCompanyActionRequired;
          const isVendorActionRequired = explicitInfo.isVendorActionRequired;

          const exceptionSummaryText = [
            totalRejected > 0 ? `${totalRejected} rejected` : null,
            totalMissing > 0 ? `${totalMissing} missing` : null,
          ]
            .filter(Boolean)
            .join(" and ");

          const lineReasons = Array.from(
            new Set(
              notice.lineItems
                .map((li) => (li.exceptionReason || li.rejectionReason)?.trim())
                .filter(Boolean)
            )
          ).join(" · ");

          return (
            <div key={notice.vendorDeliveryNoticeId}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : notice.vendorDeliveryNoticeId)}
                className="w-full px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {titlePrefix} #{idx + 1}
                      </p>
                      {/* Explicit Delivery State Pill */}
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full font-semibold border",
                          explicitInfo.badgeCls
                        )}
                      >
                        {explicitInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notice.readyAt ? formatDateTime(notice.readyAt) : "—"} · {methodLabel[method] || (method === "unknown" ? "Standard Delivery" : method)} · {notice.declaration === "partial" ? "Partial" : "Full"} ({totalDelivered} units)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                  {isPhysical && notice.dispatchStatus !== "dispatched" && notice.status !== "cancelled" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={isDispatching(notice.vendorDeliveryNoticeId)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDispatchId(notice.vendorDeliveryNoticeId);
                      }}
                      className="h-8 px-3 text-xs font-semibold"
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Dispatch Now
                    </Button>
                  )}
                  {explicitInfo.state === "final_decision_received" ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-amber-50 text-amber-900 border-amber-300">
                      Awaiting Allocation ({unresolvedNoticeUnits})
                    </span>
                  ) : isResolvedAfterDispute ? (
                    <ExceptionResolutionBadge status="resolved_after_dispute" />
                  ) : isCompanyActionRequired ? (
                    <ExceptionResolutionBadge status="under_company_review" />
                  ) : notice.resolutionStatus &&
                    notice.resolutionStatus !== "not_required" &&
                    notice.resolutionStatus !== "awaiting_vendor_response" ? (
                    <ExceptionResolutionBadge status={notice.resolutionStatus} />
                  ) : local?.status === "disputed" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-purple-50 text-purple-700 border-purple-200">
                      Disputed (Under Review)
                    </span>
                  ) : local?.status === "acknowledged" || local?.status === "mixed" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-blue-50 text-blue-700 border-blue-200">
                      Acknowledged ({local.action === "backorder" || local.type === "backorder" ? "Backordered" : local.action === "forfeit" || local.type === "forfeit" ? "Forfeited" : "Mixed"})
                    </span>
                  ) : isVendorActionRequired ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-red-50 text-red-600 border-red-200 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />{" "}
                      {unresolvedNoticeUnits > 0
                        ? `${unresolvedNoticeUnits} Exception${unresolvedNoticeUnits > 1 ? "s" : ""}`
                        : exceptionSummaryText || `${totalExceptionUnits} Exception`}
                    </span>
                  ) : isPhysical && notice.dispatchStatus === "dispatched" && explicitInfo.state !== "awaiting_receipt" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-green-50 text-green-700 border-green-200">
                      Dispatched
                    </span>
                  ) : null}
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 sm:px-6 pb-4 space-y-3">
                  {/* ── Action Panel 1: Vendor Action Required ── */}
                  {isVendorActionRequired && explicitInfo.state === "action_required" && (
                    <div className="p-3.5 rounded-xl bg-red-50/90 border border-red-200 space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-red-200/70">
                        <div className="flex items-center gap-1.5 font-bold text-red-950 flex-wrap">
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                          <span>
                            Buyer reported {exceptionSummaryText || `${totalExceptionUnits} exception units`}
                            {unresolvedNoticeUnits > 0 && unresolvedNoticeUnits < totalExceptionUnits && (
                              <span className="text-red-700 font-normal ml-1">
                                ({unresolvedNoticeUnits} unit{unresolvedNoticeUnits > 1 ? "s" : ""} pending resolution)
                              </span>
                            )}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenResolution(notice, idx, null, "backorder");
                          }}
                          className="h-8 px-3.5 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs self-end sm:self-center shrink-0"
                        >
                          Review & Resolve Exceptions ({unresolvedNoticeUnits || totalExceptionUnits})
                        </Button>
                      </div>
                      <ExceptionBreakdown fulfillment={notice} />
                    </div>
                  )}

                  {/* ── Action Panel 2: Company Action Required (Under Company Review) ── */}
                  {!isVendorActionRequired && isCompanyActionRequired && (
                    <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-purple-800">
                          <ShieldAlert className="h-4 w-4 text-purple-600 shrink-0" />
                          <span>Dispute Under Company Review</span>
                        </div>
                        <p className="text-purple-700 leading-relaxed pl-5.5">
                          Your dispute response has been submitted. The buyer must make the final decision before disputed units can be invoiced or closed.
                        </p>
                        <DisputeNotesList
                          items={notice.lineItems}
                          fallbackNote={notice.vendorResponseReason}
                        />
                        {unresolvedNoticeUnits > 0 && (
                          <div className="pt-2 pl-5.5 flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-purple-900 font-semibold">
                              Note: {unresolvedNoticeUnits} unit{unresolvedNoticeUnits > 1 ? "s" : ""} on this shipment still require resolution.
                            </span>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenResolution(notice, idx, null, "backorder");
                              }}
                              className="h-7.5 px-3 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white"
                            >
                              Resolve Remaining ({unresolvedNoticeUnits})
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Action Panel 3: Resolved After Dispute (Final Decision Reached) ── */}
                  {isResolvedAfterDispute && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>
                            Final Company Decision: {formatFinalDecisionLabel(notice.finalDecision)}
                          </span>
                        </div>
                        {notice.resolvedAt && (
                          <span className="text-[11px] text-emerald-700">
                            Resolved {formatDateTime(notice.resolvedAt)}
                          </span>
                        )}
                      </div>
                      {notice.resolutionNote && (
                        <p className="text-emerald-800 leading-relaxed pl-5.5">
                          <span className="font-semibold">Buyer Decision Note: </span>
                          {notice.resolutionNote}
                        </p>
                      )}
                      <p className="text-[11px] text-emerald-700 pl-5.5">
                        Final quantities are shown below. Original buyer inspection findings are preserved as history.
                      </p>
                    </div>
                  )}

                  {/* ── Action Panel 4: Accept Final Decision (vendor must allocate remaining units) ── */}
                  {explicitInfo.state === "final_decision_received" && onOpenFinalDecision && (
                    <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900 flex-wrap">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>
                            Buyer Final Ruling: {formatFinalDecisionLabel(notice.finalDecision)} ({pluralizeUnits(unresolvedNoticeUnits)} to Allocate)
                          </span>
                        </div>
                        <p className="text-amber-800 leading-relaxed pl-5.5">
                          The buyer has reviewed your dispute and made a final decision. You can no longer dispute these items. Choose to <strong>backorder</strong> (send replacement units) or <strong>forfeit</strong> (write off) the remaining {pluralizeUnits(unresolvedNoticeUnits)} before this shipment can be closed.
                        </p>
                        {notice.resolutionNote && (
                          <p className="text-amber-900 pl-5.5">
                            <span className="font-semibold">Buyer ruling note: </span>
                            {notice.resolutionNote}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 self-end sm:self-center pl-5.5 sm:pl-0">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFinalDecision(notice, idx);
                          }}
                          className="h-8.5 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                        >
                          Allocate Remaining ({pluralizeUnits(unresolvedNoticeUnits)})
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Evidence Thumbnails + In-Page Lightbox (Buyer & Vendor) */}
                  {((notice.evidence && notice.evidence.length > 0) ||
                    (notice.vendorEvidence && notice.vendorEvidence.length > 0)) && (
                    <EvidenceGallery
                      buyerEvidence={notice.evidence}
                      vendorEvidence={notice.vendorEvidence}
                      className="pt-1"
                    />
                  )}

                  {/* Shipment meta */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
                    <div>
                      <p className="text-xs text-muted-foreground">Reference</p>
                      <p
                        className="text-sm font-medium font-mono text-foreground truncate"
                        title={notice.fulfillmentReference || notice.shipmentReference || undefined}
                      >
                        {notice.fulfillmentReference || notice.shipmentReference || "—"}
                      </p>
                    </div>
                    {["carrier", "vendor_truck"].includes(method) ? (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">Carrier</p>
                          <p className="text-sm font-medium">{notice.carrier || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tracking #</p>
                          <p className="text-sm font-medium">{notice.trackingNumber || "—"}</p>
                        </div>
                      </>
                    ) : method === "mixed" ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery Methods</p>
                        <p className="text-sm font-medium text-[#087f70]">Per-item (detailed below)</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs text-muted-foreground">Packing Slip</p>
                      <p className="text-sm font-medium">{notice.packingSlipNumber || "—"}</p>
                    </div>
                    {notice.expectedDeliveryDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Expected Delivery</p>
                        <p className="text-sm font-medium">{formatDate(notice.expectedDeliveryDate)}</p>
                      </div>
                    )}
                    {isPhysical && notice.dispatchReference && (
                      <div>
                        <p className="text-xs text-muted-foreground">Dispatch Ref</p>
                        <p className="text-sm font-medium">{notice.dispatchReference}</p>
                      </div>
                    )}
                    {isPhysical && notice.dispatchedAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">Dispatched At</p>
                        <p className="text-sm font-medium">{formatDateTime(notice.dispatchedAt)}</p>
                      </div>
                    )}
                  </div>

                  {/* Line items in this shipment */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground w-[36%]">Item</th>
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground w-[16%]">Fulfilled Qty</th>
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground w-[22%]">Buyer Inspection</th>
                        <th className="py-2.5 text-right text-xs font-semibold text-muted-foreground w-[26%]">Remainder / Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notice.lineItems.map((li) => {
                        const poLine = orderLineItems.find(
                          (item) => item.purchaseOrderLineItemId === li.purchaseOrderLineItemId
                        );
                        const uom = poLine?.unitOfMeasure;
                        const itemMethod = li.fulfillmentMethod || method;
                        const isNonPhysicalLine =
                          itemMethod === "digital" ||
                          itemMethod === "service" ||
                          uom === "license" ||
                          uom === "service";
                        const shippedQty = li.quantityReady ?? li.quantityShipped ?? 0;
                        const orderedQty = li.quantityOrdered ?? poLine?.quantity ?? 0;
                        const isLatestForLine = !notices
                          .slice(idx + 1)
                          .some(
                            (later) =>
                              later.status !== "cancelled" &&
                              later.lineItems.some(
                                (laterLi) => laterLi.purchaseOrderLineItemId === li.purchaseOrderLineItemId
                              )
                          );
                        const cumulativeCommitted = notices
                          .slice(0, idx + 1)
                          .reduce((sum, prevNotice) => {
                            if (prevNotice.status === "cancelled") return sum;
                            const prevLi = prevNotice.lineItems.find(
                              (p) => p.purchaseOrderLineItemId === li.purchaseOrderLineItemId
                            );
                            if (!prevLi) return sum;
                            const prevHasReceipt =
                              !!prevNotice.deliveryReceiptId ||
                              !!prevNotice.receiptNumber ||
                              (prevNotice.status as string) === "confirmed";
                            if (!prevHasReceipt) {
                              return sum + (prevLi.quantityReady ?? prevLi.quantityShipped ?? 0);
                            }
                            const prevAccepted =
                              prevNotice.finalDecision != null && prevLi.finalQuantityAccepted != null
                                ? prevLi.finalQuantityAccepted
                                : (prevLi.quantityAccepted ?? prevLi.quantityReceived ?? 0);
                            const prevForfeited = (prevLi.dispositionAllocations || [])
                              .filter((a) => a.disposition === "forfeit")
                              .reduce((s, a) => s + (a.quantity || 0), 0);
                            return sum + prevAccepted + prevForfeited;
                          }, 0);
                        const remainingAfterThis =
                          isLatestForLine && poLine?.quantityRemainingToReady != null
                            ? poLine.quantityRemainingToReady
                            : Math.max(0, orderedQty - cumulativeCommitted);

                        const itemRejected = li.quantityRejected || 0;
                        const itemMissing = li.quantityMissing || 0;
                        const itemExceptionCount = itemRejected + itemMissing;
                        const itemAccepted = li.quantityAccepted ?? li.quantityReceived ?? 0;

                        // A "final" outcome only exists once the company has actually decided.
                        // enrichFulfillmentsWithReceipts back-fills finalQuantityAccepted from
                        // quantityAccepted, so it must NOT be used on its own as a signal.
                        const isLineResolved = isLineAlreadyResolved(li as any, notice);
                        const unresolvedLineUnits = getLineUnresolvedQty(li as any, notice);

                        // A line has a finalized dispute ruling only if:
                        // 1. The shipment has a finalDecision AND this line was part of it (not previously resolved before dispute)
                        // 2. OR this specific line has a finalDecision or finalQuantityAccepted set
                        const isLinePartDisputeRuling =
                          !isLineResolved &&
                          (!!notice.finalDecision || li.finalDecision != null) &&
                          (li.finalQuantityAccepted != null ||
                            li.finalQuantityRejected != null ||
                            li.resolutionStatus === "awaiting_vendor_disposition");

                        const hasFinalDecision =
                          isResolvedAfterDispute ||
                          li.resolutionStatus === "resolved_after_dispute" ||
                          isLinePartDisputeRuling;

                        const effectiveAccepted = hasFinalDecision
                          ? li.finalQuantityAccepted ?? itemAccepted
                          : itemAccepted;
                        const effectiveRejected = hasFinalDecision
                          ? li.finalQuantityRejected ?? itemRejected
                          : itemRejected;
                        const effectiveMissing = hasFinalDecision
                          ? li.finalQuantityMissing ?? itemMissing
                          : itemMissing;

                        const isFindingRevised =
                          hasFinalDecision &&
                          (effectiveAccepted !== itemAccepted ||
                            effectiveRejected !== itemRejected ||
                            effectiveMissing !== itemMissing);

                        // Rule: Use each receipt line's vendorDisposition, resolutionStatus, and expectedRedeliveryDate
                        const itemResolution = local?.itemResolutions?.[li.purchaseOrderLineItemId];
                        const lineDisposition =
                          li.vendorDisposition || itemResolution?.action || null;
                        const lineResolutionStatus = li.resolutionStatus;
                        const lineRedeliveryDate =
                          li.expectedRedeliveryDate || itemResolution?.expectedReadyDate || null;

                        return (
                          <tr key={li.vendorDeliveryNoticeLineItemId || li.purchaseOrderLineItemId} className="border-b border-border/40 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 font-semibold text-foreground">
                              <div>{li.name}</div>
                              {li.fulfillmentMethod && (
                                <p className="text-[11px] font-normal text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium capitalize text-foreground/80">
                                    {li.fulfillmentMethod.replace(/_/g, " ")}
                                  </span>
                                  {li.carrier && <span>· {li.carrier}</span>}
                                  {li.trackingNumber && (
                                    <span className="font-mono">({li.trackingNumber})</span>
                                  )}
                                  {li.expectedDeliveryDate && (
                                    <span>· ETA {formatDate(li.expectedDeliveryDate)}</span>
                                  )}
                                </p>
                              )}
                              {(li.exceptionReason || li.rejectionReason) && (
                                <p
                                  className="text-[11px] font-normal text-muted-foreground mt-0.5 truncate max-w-[340px]"
                                  title={formatExceptionReason(li.exceptionReason || li.rejectionReason)}
                                >
                                  {formatExceptionReason(li.exceptionReason || li.rejectionReason)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 text-foreground font-medium whitespace-nowrap">
                              <span>{formatQtyWithUom(shippedQty, uom)}</span>
                              {orderedQty > 0 && shippedQty < orderedQty && (
                                <span className="text-xs text-muted-foreground font-normal ml-1">
                                  of {orderedQty}
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-xs">
                              {hasFinalDecision ? (
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                      Final: {effectiveAccepted} Accepted
                                    </span>
                                    {effectiveRejected > 0 && (
                                      <span className="text-xs text-red-700 font-semibold bg-red-50 border border-red-200/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        {effectiveRejected} Rejected
                                      </span>
                                    )}
                                    {effectiveMissing > 0 && (
                                      <span className="text-xs text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                        {effectiveMissing} Missing
                                      </span>
                                    )}
                                  </div>
                                  {isFindingRevised && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Original Finding (History): {itemAccepted} Accepted
                                      {itemRejected > 0 ? ` · ${itemRejected} Rejected` : ""}
                                      {itemMissing > 0 ? ` · ${itemMissing} Missing` : ""}
                                    </p>
                                  )}
                                </div>
                              ) : itemExceptionCount > 0 ? (
                                <span className="text-xs text-red-700 font-semibold bg-red-50 border border-red-200/80 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                  {itemAccepted} Accepted
                                  {itemRejected > 0 ? ` · ${itemRejected} Rejected` : ""}
                                  {itemMissing > 0 ? ` · ${itemMissing} Missing` : ""}
                                </span>
                              ) : notice.dispatchStatus !== "dispatched" ? (
                                <span className="text-muted-foreground">—</span>
                              ) : shippedQty === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (li.quantityReceived === shippedQty || itemAccepted === shippedQty) && itemAccepted > 0 ? (
                                <span className="text-green-700 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> All {itemAccepted} Accepted
                                </span>
                              ) : (li.quantityReceived || 0) > 0 ? (
                                <span>
                                  {li.quantityReceived} Received, {li.quantityAwaitingReceipt}{" "}
                                  {isNonPhysicalLine ? "Awaiting Confirmation" : "Awaiting Inspection"}
                                </span>
                              ) : (
                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-amber-600" />
                                  {isNonPhysicalLine ? "Awaiting Confirmation" : "Awaiting Inspection"} ({shippedQty})
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              {itemExceptionCount > 0 ? (
                                unresolvedLineUnits > 0 &&
                                (explicitInfo.state === "final_decision_received" ||
                                  notice.finalDecision != null) ? (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => onOpenFinalDecision?.(notice, idx)}
                                          className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-300 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:bg-amber-100/80 transition-colors shadow-xs"
                                        >
                                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                          Allocate ({formatQtyWithUom(unresolvedLineUnits, uom)})
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="end" className="p-2.5 space-y-1 bg-white border border-amber-200 shadow-xl rounded-xl max-w-xs text-left">
                                        <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-900">
                                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                          <span>Buyer Ruling: {formatFinalDecisionLabel(notice.finalDecision)}</span>
                                        </div>
                                        <p className="text-xs text-amber-800 leading-relaxed">
                                          Click to allocate {formatQtyWithUom(unresolvedLineUnits, uom)} to backorder or forfeit.
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : lineDisposition === "dispute" ||
                                  lineResolutionStatus === "under_company_review" ||
                                  (!isVendorActionRequired && lineResolutionStatus === "disputed") ? (
                                  li.vendorResponseReason ? (
                                    <TooltipProvider delayDuration={150}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:bg-purple-100/70 transition-colors">
                                            <ShieldAlert className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                            {itemExceptionCount > 0
                                              ? `${formatQtyWithUom(itemExceptionCount, uom)} Disputed (Under Review)`
                                              : "Disputed (Under Review)"}
                                            <Info className="h-3 w-3 text-purple-600/70 shrink-0 ml-0.5" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="end" className="p-2.5 space-y-1 bg-white border border-purple-200 shadow-xl rounded-xl max-w-xs">
                                          <div className="flex items-center gap-1.5 font-bold text-[11px] text-purple-900">
                                            <ShieldAlert className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                            <span>Your Dispute Note</span>
                                          </div>
                                          <p className="text-xs text-purple-800 italic leading-relaxed break-words">
                                            &ldquo;{li.vendorResponseReason}&rdquo;
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1 whitespace-nowrap">
                                      <ShieldAlert className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                      {itemExceptionCount > 0
                                        ? `${formatQtyWithUom(itemExceptionCount, uom)} Disputed (Under Review)`
                                        : "Disputed (Under Review)"}
                                    </span>
                                  )
                                ) : lineDisposition === "backorder" ||
                                  lineResolutionStatus === "backordered" ? (
                                  li.vendorResponseReason ? (
                                    <TooltipProvider delayDuration={150}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#f0faf8] text-[#00b29a] border border-[#cbf0eb] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer hover:bg-[#e2f7f4] transition-colors">
                                            <Clock className="h-3.5 w-3.5 text-[#00b29a] shrink-0" /> Backordered
                                            {lineRedeliveryDate ? ` (${formatDate(lineRedeliveryDate)})` : ""}
                                            <Info className="h-3 w-3 text-[#00b29a]/70 shrink-0 ml-0.5" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="end" className="p-2.5 space-y-1 bg-white border border-[#cbf0eb] shadow-xl rounded-xl max-w-xs">
                                          <div className="flex items-center gap-1.5 font-bold text-[11px] text-[#087f70]">
                                            <Clock className="h-3.5 w-3.5 text-[#00b29a] shrink-0" />
                                            <span>Your Backorder Note</span>
                                          </div>
                                          <p className="text-xs text-[#0b544b] italic leading-relaxed break-words">
                                            &ldquo;{li.vendorResponseReason}&rdquo;
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#f0faf8] text-[#00b29a] border border-[#cbf0eb] inline-flex items-center gap-1 whitespace-nowrap">
                                      <Clock className="h-3.5 w-3.5 text-[#00b29a] shrink-0" /> Backordered
                                      {lineRedeliveryDate ? ` (${formatDate(lineRedeliveryDate)})` : ""}
                                    </span>
                                  )
                                ) : lineDisposition === "forfeit" ||
                                  lineResolutionStatus === "forfeited" ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 whitespace-nowrap">
                                    <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" /> Forfeited
                                  </span>
                                ) : isResolvedAfterDispute ||
                                  li.resolutionStatus === "resolved_after_dispute" ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Resolved After Dispute
                                  </span>
                                ) : isLineResolved ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Resolved
                                  </span>
                                ) : isVendorActionRequired ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      onOpenResolution(
                                        notice,
                                        idx,
                                        li.purchaseOrderLineItemId || (li as any).deliveryReceiptLineItemId,
                                        "backorder"
                                      )
                                    }
                                    className="h-7 px-3 text-xs font-semibold border-[#00b29a] text-[#00b29a] hover:bg-[#00b29a]/10"
                                  >
                                    Resolve Item
                                  </Button>
                                ) : (
                                  <ExceptionResolutionBadge status={lineResolutionStatus || notice.resolutionStatus} />
                                )
                              ) : li.remainingDisposition === "backordered" ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                    {remainingAfterThis > 0 ? `${formatQtyWithUom(remainingAfterThis, uom)} backordered` : "Backordered"}
                                    {li.expectedReadyDate ? ` · Est. ${formatDate(li.expectedReadyDate)}` : ""}
                                  </span>
                                  {(li.dispositionReason || li.reason) && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {li.dispositionReason || li.reason}
                                    </span>
                                  )}
                                </div>
                              ) : li.remainingDisposition === "cannot_fulfill" ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                                    {remainingAfterThis > 0 ? `${formatQtyWithUom(remainingAfterThis, uom)} cancelled` : "Cancelled"}
                                  </span>
                                  {(li.dispositionReason || li.reason) && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {li.dispositionReason || li.reason}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>

                  {notice.notes && (
                    <p className="text-xs text-muted-foreground italic">Note: {notice.notes}</p>
                  )}

                  {isPhysical && notice.dispatchStatus !== "dispatched" && (
                    <div className="flex justify-end pt-2 border-t border-border/40 mt-3">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={isDispatching(notice.vendorDeliveryNoticeId)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDispatchId(notice.vendorDeliveryNoticeId);
                        }}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Dispatch Shipment
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!confirmDispatchId} onOpenChange={(o) => !o && setConfirmDispatchId(null)}>
        <DialogContent size="sm">
          <DialogTitle>Confirm Dispatch</DialogTitle>
          <div className="mt-2 text-sm text-muted-foreground">
            <p>Are you sure you want to dispatch this shipment?</p>
            <p className="mt-1">This will notify the buyer that the items are on the way.</p>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmDispatchId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirmDispatchId) {
                  onDispatch(confirmDispatchId);
                  setConfirmDispatchId(null);
                }
              }}
            >
              Confirm Dispatch
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ── Receipt Confirmation Section ──
// Shows vendors what the buyer has confirmed receiving vs what was dispatched, including any rejected/missing units.
function ReceiptConfirmationSection({
  lineItems,
  fulfillments = [],
  onOpenResolution,
  onOpenFinalDecision,
}: {
  lineItems: OrderLineItem[];
  fulfillments?: Fulfillment[];
  onOpenResolution?: (
    notice: Fulfillment,
    index: number,
    targetItemId?: string | null,
    action?: VendorResolutionAction
  ) => void;
  onOpenFinalDecision?: (notice: Fulfillment, index: number) => void;
}) {
  // Derive per-line dispatched, accepted, rejected/missing, forfeited, and awaiting quantities from fulfillments + lineItems
  const normalizedLines = lineItems.map((item) => {
    const hasFulfillments = fulfillments.length > 0;

    let shippedFromFulfillments = 0;
    let acceptedFromFulfillments = 0;
    let rejectedFromFulfillments = 0;
    let missingFromFulfillments = 0;
    let awaitingFromFulfillments = 0;

    if (hasFulfillments) {
      for (const f of fulfillments) {
        if (f.status === "cancelled") continue;
        const isPhysical = ["carrier", "vendor_truck"].includes(f.fulfillmentMethod || "");
        // Only count shipments that have been dispatched (or non-physical shipments)
        if (isPhysical && f.dispatchStatus !== "dispatched") continue;

        const match = f.lineItems.find(
          (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
        );
        if (!match) continue;

        const hasFinal =
          f.resolutionStatus === "resolved_after_dispute" ||
          match.resolutionStatus === "resolved_after_dispute" ||
          match.finalQuantityAccepted != null;

        const lineAcc = hasFinal
          ? match.finalQuantityAccepted ?? match.quantityAccepted ?? match.quantityReceived ?? 0
          : match.quantityAccepted ?? match.quantityReceived ?? 0;
        const lineRej = hasFinal
          ? match.finalQuantityRejected ?? match.quantityRejected ?? 0
          : match.quantityRejected ?? 0;
        const lineMis = hasFinal
          ? match.finalQuantityMissing ?? match.quantityMissing ?? 0
          : match.quantityMissing ?? 0;

        const lineShipped =
          match.quantityReady ||
          match.quantityShipped ||
          lineAcc + lineRej + lineMis ||
          0;

        shippedFromFulfillments += lineShipped;
        acceptedFromFulfillments += lineAcc;
        rejectedFromFulfillments += lineRej;
        missingFromFulfillments += lineMis;

        const isFullyInspected =
          hasFinal ||
          f.confirmationOutcome === "confirmed" ||
          f.confirmationOutcome === "confirmed_with_exceptions" ||
          f.inspectionOutcome === "accepted_with_exceptions" ||
          f.inspectionOutcome === "rejected" ||
          lineAcc + lineRej + lineMis >= lineShipped;

        if (!isFullyInspected) {
          awaitingFromFulfillments +=
            match.quantityAwaitingReceipt ?? Math.max(0, lineShipped - (lineAcc + lineRej + lineMis));
        }
      }
    }

    const received = Math.max(
      item.quantityAccepted ?? item.quantityReceived ?? 0,
      acceptedFromFulfillments
    );
    const rejected = rejectedFromFulfillments;
    const missing = missingFromFulfillments;
    const exceptions = rejected + missing;
    const forfeited = item.quantityForfeited || 0;
    const awaiting = hasFulfillments
      ? awaitingFromFulfillments
      : item.quantityAwaitingReceipt || 0;

    // Never shrink dispatched down to accepted when units were rejected/missing!
    const rawDispatched = item.quantityDispatched || 0;
    const dispatched = Math.max(
      rawDispatched,
      shippedFromFulfillments,
      received + exceptions + awaiting
    );

    return {
      ...item,
      normalizedDispatched: dispatched,
      normalizedReceived: received,
      normalizedRejected: rejected,
      normalizedMissing: missing,
      normalizedExceptions: exceptions,
      normalizedForfeited: forfeited,
      normalizedAwaiting: awaiting,
    };
  });

  const totalDispatched = normalizedLines.reduce((sum, item) => sum + item.normalizedDispatched, 0);
  const totalReceived = normalizedLines.reduce((sum, item) => sum + item.normalizedReceived, 0);
  const totalRejected = normalizedLines.reduce((sum, item) => sum + item.normalizedRejected, 0);
  const totalMissing = normalizedLines.reduce((sum, item) => sum + item.normalizedMissing, 0);
  const totalExceptions = normalizedLines.reduce((sum, item) => sum + item.normalizedExceptions, 0);
  const totalForfeited = normalizedLines.reduce((sum, item) => sum + item.normalizedForfeited, 0);
  const totalAwaiting = normalizedLines.reduce((sum, item) => sum + item.normalizedAwaiting, 0);

  if (totalDispatched === 0 && totalReceived === 0 && totalExceptions === 0 && totalForfeited === 0) {
    return null;
  }

  const acceptedPct =
    totalDispatched > 0 ? Math.round((totalReceived / totalDispatched) * 100) : 0;
  const exceptionPct =
    totalDispatched > 0 ? Math.round((totalExceptions / totalDispatched) * 100) : 0;

  const activeNoticeWithRejection = fulfillments.find(
    (f) =>
      f.status !== "cancelled" &&
      (f.vendorActionRequired === true ||
        f.resolutionStatus === "awaiting_vendor_response" ||
        f.lineItems.some(
          (li) =>
            (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0 &&
            !isLineAlreadyResolved(li, f)
        ))
  );
  const activeNoticeIndex = activeNoticeWithRejection
    ? fulfillments.indexOf(activeNoticeWithRejection)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Receipt Confirmation</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalAwaiting > 0 ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-amber-50 text-amber-800 border-amber-200">
              {totalAwaiting} awaiting buyer inspection
            </span>
          ) : totalExceptions > 0 ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-red-50 text-red-700 border-red-200">
              {totalReceived} of {totalDispatched} accepted · {totalExceptions} rejected
            </span>
          ) : totalReceived > 0 ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-green-50 text-green-700 border-green-200">
              All {totalReceived} confirmed
            </span>
          ) : null}

          {activeNoticeWithRejection && (() => {
            const hasPendingFinalDecision =
              activeNoticeWithRejection.finalDecision != null &&
              (activeNoticeWithRejection.resolutionStatus === "awaiting_vendor_disposition" ||
                activeNoticeWithRejection.vendorActionRequired === true);
            const openNoticeUnits = activeNoticeWithRejection.lineItems.reduce(
              (sum, li) => sum + getLineUnresolvedQty(li as any, activeNoticeWithRejection),
              0
            );
            if (openNoticeUnits === 0 && totalExceptions === 0) return null;

            if (hasPendingFinalDecision && onOpenFinalDecision && openNoticeUnits > 0) {
              return (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenFinalDecision(activeNoticeWithRejection, activeNoticeIndex)}
                  className="h-7.5 px-3 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-2xs"
                >
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  Allocate Remaining ({pluralizeUnits(openNoticeUnits)})
                </Button>
              );
            }

            if (onOpenResolution && openNoticeUnits > 0) {
              return (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    onOpenResolution(
                      activeNoticeWithRejection,
                      activeNoticeIndex,
                      null,
                      "backorder"
                    )
                  }
                  className="h-7.5 px-3 text-xs font-semibold bg-[#e14856] hover:bg-[#c93b48] text-white shadow-2xs"
                >
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  Resolve {`${openNoticeUnits} Pending Unit${openNoticeUnits > 1 ? "s" : ""}`}
                </Button>
              );
            }

            return null;
          })()}
        </div>
      </div>

      {/* Summary stats */}
      <div
        className={cn(
          "grid gap-4 px-6 py-4 bg-muted/20 border-b border-border/60",
          totalExceptions > 0 && totalForfeited > 0
            ? "grid-cols-2 sm:grid-cols-5"
            : totalExceptions > 0 || totalForfeited > 0
            ? "grid-cols-2 sm:grid-cols-4"
            : "grid-cols-3"
        )}
      >
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{totalDispatched}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Dispatched</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-green-700">{totalReceived}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Buyer Accepted</p>
        </div>
        {totalExceptions > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold text-red-600">{totalExceptions}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalRejected > 0 && totalMissing > 0
                ? "Rejected / Missing"
                : totalMissing > 0
                ? "Missing"
                : "Buyer Rejected"}
            </p>
          </div>
        )}
        {totalForfeited > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold text-rose-600">{totalForfeited}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Forfeited</p>
          </div>
        )}
        <div className="text-center">
          <p className={cn("text-lg font-bold", totalAwaiting > 0 ? "text-amber-600" : "text-muted-foreground")}>
            {totalAwaiting}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Awaiting</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalDispatched > 0 && (
        <div className="px-6 py-3 border-b border-border/60">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 flex-wrap gap-2">
            <span>
              Buyer inspection outcome ({totalReceived} of {totalDispatched} accepted
              {totalExceptions > 0 ? ` · ${totalExceptions} rejected` : ""}
              {totalAwaiting > 0 ? ` · ${totalAwaiting} awaiting` : ""})
            </span>
            {totalReceived === 0 && totalExceptions === 0 && totalAwaiting > 0 ? (
              <span className="font-semibold text-amber-700">Pending buyer inspection</span>
            ) : (
              <span className="font-semibold text-foreground">{acceptedPct}% accepted</span>
            )}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.min(100, acceptedPct)}%` }}
            />
            {exceptionPct > 0 && (
              <div
                className="h-full bg-red-400 transition-all duration-500"
                style={{ width: `${Math.min(100 - acceptedPct, exceptionPct)}%` }}
              />
            )}
            {totalReceived === 0 && totalExceptions === 0 && totalAwaiting > 0 && (
              <div className="h-full w-full bg-amber-300/60 transition-all duration-500" />
            )}
          </div>
        </div>
      )}

      {/* Per-item breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Item</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">You Dispatched</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Buyer Accepted</th>
              {totalExceptions > 0 && (
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                  {totalRejected > 0 && totalMissing > 0
                    ? "Rejected / Missing"
                    : totalMissing > 0
                    ? "Missing"
                    : "Buyer Rejected"}
                </th>
              )}
              {totalForfeited > 0 && (
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Forfeited</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Awaiting</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {normalizedLines.map((item) => {
              const dispatched = item.normalizedDispatched;
              const received = item.normalizedReceived;
              const exceptions = item.normalizedExceptions;
              const forfeited = item.normalizedForfeited;
              const awaiting = item.normalizedAwaiting;
              const uom = item.unitOfMeasure || "unit";

              // Skip items with no dispatch/receipt activity at all
              if (dispatched === 0 && received === 0 && exceptions === 0 && forfeited === 0) return null;

              return (
                <tr key={item.purchaseOrderLineItemId} className="border-b border-border/40">
                  <td className="px-6 py-3 text-sm font-medium">{item.name}</td>
                  <td className="px-6 py-3 text-sm whitespace-nowrap">
                    <span className="font-semibold text-foreground">{formatQtyWithUom(dispatched, uom)}</span>
                    <span className="text-xs text-muted-foreground ml-1">of {item.quantity}</span>
                  </td>
                  <td className="px-6 py-3 text-sm whitespace-nowrap">
                    <span className={cn("font-semibold", received > 0 ? "text-green-700" : "text-muted-foreground")}>
                      {received > 0 ? formatQtyWithUom(received, uom) : "0"}
                    </span>
                  </td>
                  {totalExceptions > 0 && (
                    <td className="px-6 py-3 text-sm whitespace-nowrap">
                      <span className={cn("font-semibold", exceptions > 0 ? "text-red-600" : "text-muted-foreground")}>
                        {exceptions > 0 ? formatQtyWithUom(exceptions, uom) : "0"}
                      </span>
                    </td>
                  )}
                  {totalForfeited > 0 && (
                    <td className="px-6 py-3 text-sm whitespace-nowrap">
                      <span className={cn("font-semibold", forfeited > 0 ? "text-rose-600" : "text-muted-foreground")}>
                        {forfeited > 0 ? formatQtyWithUom(forfeited, uom) : "0"}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-3 text-sm whitespace-nowrap">
                    <span className={cn("font-medium", awaiting > 0 ? "text-amber-600" : "text-muted-foreground")}>
                      {awaiting > 0 ? formatQtyWithUom(awaiting, uom) : "0"}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    {(() => {
                      const matchingLines = fulfillments.flatMap((f) =>
                        f.lineItems
                          .filter((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId)
                          .map((li) => ({ fulfillment: f, line: li }))
                      );

                      const isResolved =
                        matchingLines.length > 0 &&
                        matchingLines.every(({ line, fulfillment }) => isLineAlreadyResolved(line, fulfillment));

                      const isPendingFinalDecision =
                        matchingLines.some(
                          ({ line, fulfillment }) =>
                            fulfillment.finalDecision != null &&
                            (fulfillment.resolutionStatus === "awaiting_vendor_disposition" ||
                              line.resolutionStatus === "awaiting_vendor_disposition" ||
                              fulfillment.vendorActionRequired === true) &&
                            !isLineAlreadyResolved(line, fulfillment)
                        );

                      const isUnderDispute =
                        matchingLines.some(
                          ({ line, fulfillment }) =>
                            (fulfillment.resolutionStatus === "under_company_review" ||
                              line.vendorDisposition === "dispute") &&
                            !fulfillment.finalDecision &&
                            !isLineAlreadyResolved(line, fulfillment)
                        );

                      if (dispatched === 0) {
                        return <span className="text-xs text-muted-foreground">Not dispatched</span>;
                      }

                      if (awaiting > 0 && received === 0 && exceptions === 0) {
                        return (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                            Awaiting Confirmation
                          </span>
                        );
                      }

                      if (isResolved && exceptions > 0) {
                        const totalAllocated = matchingLines.reduce(
                          (acc, { line, fulfillment }) => {
                            const q = getLineAllocatedQty(line, fulfillment);
                            return {
                              backorder: acc.backorder + q.backorder,
                              forfeit: acc.forfeit + q.forfeit,
                            };
                          },
                          { backorder: 0, forfeit: 0 }
                        );
                        const parts: string[] = [];
                        if (totalAllocated.backorder > 0)
                          parts.push(
                            `${totalAllocated.backorder} Backorder${totalAllocated.backorder > 1 ? "s" : ""}`
                          );
                        if (totalAllocated.forfeit > 0)
                          parts.push(
                            `${totalAllocated.forfeit} Forfeit${totalAllocated.forfeit > 1 ? "ed" : ""}`
                          );
                        const details = parts.length > 0 ? ` (${parts.join(", ")})` : "";
                        return (
                          <span className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1">
                            ✓ Resolved{details}
                          </span>
                        );
                      }

                      if (isPendingFinalDecision) {
                        return (
                          <span className="text-xs text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1">
                            {received > 0 ? `${received} Accepted · ${exceptions} Rejected` : `${exceptions} Rejected`} (Allocation Required)
                          </span>
                        );
                      }

                      if (isUnderDispute) {
                        return (
                          <span className="text-xs text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
                            Under Buyer Review
                          </span>
                        );
                      }

                      if (exceptions > 0) {
                        return (
                          <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md font-medium">
                            {received > 0 ? `${received} Accepted · ${exceptions} Rejected` : `${exceptions} Rejected`}
                          </span>
                        );
                      }

                      if (received >= dispatched) {
                        return (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md font-medium">
                            All {received} Accepted
                          </span>
                        );
                      }

                      if (received > 0) {
                        return (
                          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-medium">
                            Partially Accepted ({received}/{dispatched})
                          </span>
                        );
                      }

                      return (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                          Awaiting Confirmation
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const poId = order?.purchaseOrderId || id;
  const { data: receiptExceptions } = useOrderFulfillmentExceptions(poId);
  const acknowledge = useAcknowledgeOrder();
  const readyForDelivery = useMarkReadyForDelivery();
  const createFulfillment = useCreateFulfillment();
  const dispatchFulfillmentMutation = useDispatchFulfillment();
  const resolveReceiptException = useResolveReceiptException();
  const acceptFinalDecisionMutation = useAcceptFinalDecision();

  const [acknowledging, setAcknowledging] = useState(false);
  const [priceProposalModalState, setPriceProposalModalState] = useState<{
    open: boolean;
    mode: "create" | "view" | "edit";
    requestId: string | null;
  }>({
    open: false,
    mode: "create",
    requestId: null,
  });

  // Price change queries & commercial state invariants
  const isTerminalOrder = ["closed", "cancelled"].includes(order?.status ?? "");
  const { data: priceChangeRequestsData } = usePriceChangeRequests(
    poId,
    1,
    !!order && (order.status === "issued" || (order.revisionNumber ?? 1) > 1 || !isTerminalOrder)
  );
  const { data: priceEligibility } = usePriceChangeEligibility(
    poId,
    !!order && !isTerminalOrder
  );
  const withdrawProposalMutation = useWithdrawPriceProposal(poId);

  const activePriceChangeRequest = priceChangeRequestsData?.data?.find((r) =>
    ["pending_review", "returned_for_correction", "approved_pending_issue"].includes(r.status)
  );
  const hasPendingPriceProposal = !!activePriceChangeRequest;
  const isPreAcknowledgement = order?.status === "issued";

  const hasEligibleLines =
    priceEligibility?.lineItems
      ? priceEligibility.lineItems.some(
          (line) => Number(line.eligibleQuantity) > 0 && !line.activeRequestId
        )
      : (order?.lineItems?.some((li) => {
          const accepted = li.quantityAccepted ?? li.quantityReceived ?? 0;
          const forfeited = li.quantityForfeited ?? 0;
          return (li.quantity || 0) - accepted - forfeited > 0;
        }) ?? false);

  // Workflow 1: Initial price negotiation before order acceptance
  const canProposeInitialPrice =
    isPreAcknowledgement && priceEligibility?.eligible !== false && !hasPendingPriceProposal;

  // Workflow 2: Formal commercial amendment for outstanding/backordered quantities after acceptance
  const canRequestPriceAmendment =
    !isPreAcknowledgement &&
    !isTerminalOrder &&
    priceEligibility?.eligible !== false &&
    hasEligibleLines &&
    !hasPendingPriceProposal;

  // Per-item promise dates entered before acknowledging
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});

  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [modalDeclaration, setModalDeclaration] = useState<DeliveryType>("full");
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<OrderLineItem | null>(null);
  const [multiBannerExpanded, setMultiBannerExpanded] = useState(false);

  // Unified resolution modal state (supports both single-item and multi-item resolutions)
  const [resolutionModalState, setResolutionModalState] = useState<{
    open: boolean;
    fulfillment: Fulfillment | null;
    fulfillmentIndex: number;
    targetLineItemId?: string | null;
    initialAction?: VendorResolutionAction;
  }>({
    open: false,
    fulfillment: null,
    fulfillmentIndex: 0,
    targetLineItemId: null,
    initialAction: "backorder",
  });

  // Final-decision modal state — reuses ResolutionModal with accept-final-decision endpoint
  const [finalDecisionModalState, setFinalDecisionModalState] = useState<{
    open: boolean;
    fulfillment: Fulfillment | null;
    fulfillmentIndex: number;
  }>({
    open: false,
    fulfillment: null,
    fulfillmentIndex: 0,
  });

  const [localResolutions, setLocalResolutions] = useState<
    Record<
      string,
      {
        status: "acknowledged" | "disputed" | "mixed";
        action?: string;
        type?: string;
        itemResolutions?: Record<string, LineItemResolution>;
      }
    >
  >({});

  const handleOpenResolution = (
    notice: Fulfillment,
    index: number,
    targetItemId: string | null = null,
    initialAction: VendorResolutionAction = "backorder"
  ) => {
    setResolutionModalState({
      open: true,
      fulfillment: notice,
      fulfillmentIndex: index,
      targetLineItemId: targetItemId,
      initialAction,
    });
  };

  const handleOpenFinalDecision = (notice: Fulfillment, index: number) => {
    setFinalDecisionModalState({
      open: true,
      fulfillment: notice,
      fulfillmentIndex: index,
    });
  };

  const handleFinalDecisionSubmit = async (payload: UnifiedResolutionPayload) => {
    const deliveryReceiptId =
      payload.deliveryReceiptId ||
      finalDecisionModalState.fulfillment?.deliveryReceiptId;

    if (!deliveryReceiptId) {
      toast.error("No receipt ID found. Cannot submit final decision acceptance.");
      return;
    }

    try {
      await acceptFinalDecisionMutation.mutateAsync({
        purchaseOrderId: order!.purchaseOrderId,
        deliveryReceiptId,
        resolution: payload,
      });
      setFinalDecisionModalState((prev) => ({ ...prev, open: false }));
    } catch {
      // Error toast already handled in useAcceptFinalDecision
    }
  };

  const { data: invoicesData } = useInvoices({ purchaseOrderId: id });

  useEffect(() => {
    if (!order) return;

    setDraftDates((prev) => {
      const next = { ...prev };
      for (const item of order.lineItems) {
        if (!(item.purchaseOrderLineItemId in next)) {
          next[item.purchaseOrderLineItemId] = resolveAcknowledgePromiseDate(
            item.promisedDeliveryDate || item.deliveryDate,
            order.promisedDeliveryDate || order.deliveryDate
          );
        }
      }
      return next;
    });
  }, [order]);

  if (isLoading) return <OrderDetailSkeleton />;

  if (isError) {
    return <ErrorState message="Couldn't load this order. Please try again." onRetry={() => refetch()} />;
  }

  if (!order) {
    return (
      <EmptyState
        title="Order not found"
        description="This order may have been removed, or you may not have access to it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  }

  const invoices = invoicesData || [];
  const existingInvoice = invoices[0];

  // Helper: how many units are still fulfillable for an item (includes backordered balances)
  const getRemainingToReady = (item: typeof order.lineItems[0]) => {
    if (item.remainingDisposition === "cannot_fulfill") return 0;
    return (
      item.quantityRemainingToReady ??
      item.quantityOutstanding ??
      Math.max(0, item.quantity - (item.quantityReady || 0) - (item.quantityForfeited || 0))
    );
  };

  const hasItemsToFulfill = order.lineItems.some(item => getRemainingToReady(item) > 0);

  // Invoice validation uses accepted quantity, not dispatched or physically received quantity.
  const hasAnyConfirmedReceipt = order.lineItems.some(
    (item) => (item.quantityAccepted ?? item.quantityReceived ?? 0) > 0
  );
  const canCreateInvoice =
    hasAnyConfirmedReceipt &&
    [
      "acknowledged",
      "ready_for_delivery",
      "partially_delivered",
      "partially_delivered_with_exceptions",
      "delivered",
      "delivered_with_exceptions",
      "closed",
    ].includes(order.status);
  const allDatesEntered = order.lineItems.every((item) => !!draftDates[item.purchaseOrderLineItemId]);

  const handleAcknowledge = () => {
    if (!allDatesEntered) {
      toast.error("Please enter a promise date for every item before acknowledging.");
      return;
    }
    const hasPastDate = order.lineItems.some((item) =>
      isPastCalendarDate(draftDates[item.purchaseOrderLineItemId])
    );
    if (hasPastDate) {
      toast.error("Promise date cannot be in the past.");
      return;
    }
    acknowledge.mutate({
      purchaseOrderId: order.purchaseOrderId,
      payload: {
        lineItems: order.lineItems.map((item) => ({
          purchaseOrderLineItemId: item.purchaseOrderLineItemId,
          promisedDeliveryDate: draftDates[item.purchaseOrderLineItemId],
        })),
      },
    }, { onSuccess: () => setAcknowledging(false) });
  };

  const handleDeliveryTypeSelect = (type: DeliveryType) => {
    if (!deliveryEligibility.canCreateDelivery) {
      toast.error(
        deliveryEligibility.blockLabel ||
          "A fulfillment is currently incomplete on this order. You cannot create a new fulfillment until all previous shipments are completed."
      );
      return;
    }
    setModalDeclaration(type);
    setFulfillmentModalOpen(true);
  };

  const handleFulfillmentSubmit = async (data: FulfillmentFormData) => {
    const deliveryValidationError = validateFulfillmentDeliveryDetails({
      usePerItemMethod: data.usePerItemMethod,
      fulfillmentMethod: data.fulfillmentMethod,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      expectedDeliveryDate: data.expectedDeliveryDate,
      lineItems: data.lineItems.map((li) => {
        const poItem = order.lineItems.find(
          (i) => i.purchaseOrderLineItemId === li.purchaseOrderLineItemId
        );
        return {
          purchaseOrderLineItemId: li.purchaseOrderLineItemId,
          name: poItem?.name,
          fulfillmentMethod: li.fulfillmentMethod,
          carrier: li.carrier,
          trackingNumber: li.trackingNumber,
          expectedDeliveryDate: li.expectedDeliveryDate,
        };
      }),
    });
    if (deliveryValidationError) {
      toast.error(deliveryValidationError);
      return;
    }

    // Validate partial dispositions
    if (data.declaration === "partial") {
      const invalidItems = data.lineItems.filter(li => {
        const item = order.lineItems.find(i => i.purchaseOrderLineItemId === li.purchaseOrderLineItemId);
        if (!item) return false;
        const remaining = getRemainingToReady(item);
        if (remaining === 0) return false;
        if (li.quantityReady < remaining && !li.remainingDisposition) return true;
        if (
          li.quantityReady < remaining &&
          (li.remainingDisposition === "backordered" || li.remainingDisposition === "cannot_fulfill") &&
          !li.reason?.trim() &&
          !li.dispositionReason?.trim()
        ) {
          return true;
        }
        if (
          li.quantityReady < remaining &&
          li.remainingDisposition === "backordered" &&
          !li.expectedReadyDate
        ) {
          return true;
        }
        return false;
      });

      if (invalidItems.length > 0) {
        toast.error("Please complete all disposition fields, including reason, for partial quantities.");
        return;
      }
    }

    const existingRefsOnOrder = new Set(
      (order.fulfillments || order.deliveryNotices || [])
        .flatMap((f) => [f.fulfillmentReference, f.shipmentReference])
        .map((r) => r?.trim().toLowerCase())
        .filter((r): r is string => !!r)
    );
    const nextShipmentNum = (order.fulfillments?.length || order.deliveryNotices?.length || 0) + 1;
    const rawUserRef = data.fulfillmentReference?.trim();
    const generatedRef = rawUserRef
      ? existingRefsOnOrder.has(rawUserRef.toLowerCase())
        ? `${rawUserRef}-SHP${nextShipmentNum}-${crypto.randomUUID().slice(0, 4)}`
        : rawUserRef
      : `FUL-${crypto.randomUUID().slice(0, 8)}`;
    const isPhysicalMethod = data.usePerItemMethod
      ? data.lineItems.some((li) =>
          ["carrier", "vendor_truck"].includes(li.fulfillmentMethod || "")
        )
      : ["carrier", "vendor_truck"].includes(data.fulfillmentMethod || "");
    const shouldDispatchImmediately = isPhysicalMethod && data.dispatchNow !== false;

    const payload = buildCreateFulfillmentPayload({
      fulfillmentReference: generatedRef,
      declaration: data.declaration,
      readyAt: new Date().toISOString(),
      usePerItemMethod: data.usePerItemMethod,
      fulfillmentMethod: data.fulfillmentMethod,
      expectedDeliveryDate: data.expectedDeliveryDate,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      packingSlipNumber: data.packingSlipNumber,
      notes: data.notes,
      lineItems: data.lineItems,
    });

    try {
      const createdRes = await createFulfillment.mutateAsync({
        purchaseOrderId: order.purchaseOrderId,
        payload,
      });

      if (shouldDispatchImmediately) {
        // Resolve the newly created fulfillment ID from the response or from a fresh order fetch
        let newFulfillmentId =
          createdRes?.fulfillment?.vendorDeliveryNoticeId ||
          createdRes?.fulfillment?.fulfillmentId ||
          (createdRes as any)?.vendorDeliveryNoticeId ||
          (createdRes as any)?.fulfillmentId;

        if (!newFulfillmentId) {
          const refreshed = await refetch();
          const refreshedList =
            refreshed.data?.fulfillments || refreshed.data?.deliveryNotices || [];
          const matchByRef = [...refreshedList]
            .reverse()
            .find(
              (f) =>
                f.fulfillmentReference === generatedRef ||
                f.shipmentReference === generatedRef ||
                f.dispatchStatus !== "dispatched"
            );
          newFulfillmentId =
            matchByRef?.vendorDeliveryNoticeId || matchByRef?.fulfillmentId;
        }

        if (newFulfillmentId) {
          await dispatchFulfillmentMutation.mutateAsync({
            purchaseOrderId: order.purchaseOrderId,
            fulfillmentId: newFulfillmentId,
            payload: {
              dispatchReference: `DSP-${crypto.randomUUID().slice(0, 8)}`,
              dispatchedAt: new Date().toISOString(),
            },
          });
        }
      } else if (isPhysicalMethod) {
        toast.info(
          "Fulfillment staged as ready. Remember to click 'Dispatch Shipment' once goods leave your facility."
        );
      }

      setFulfillmentModalOpen(false);
    } catch {
      // Mutation hooks already display error toasts
    }
  };

  const handleUnifiedResolutionSubmit = async (payload: UnifiedResolutionPayload) => {
    const fId = payload.fulfillmentId;
    const deliveryReceiptId =
      payload.deliveryReceiptId ||
      resolutionModalState.fulfillment?.deliveryReceiptId;

    // When a real deliveryReceiptId is present, submit to the backend endpoints
    // (POST .../acknowledge and/or POST .../evidence + POST .../dispute)
    if (deliveryReceiptId) {
      try {
        await resolveReceiptException.mutateAsync({
          purchaseOrderId: order.purchaseOrderId,
          deliveryReceiptId,
          resolution: payload,
        });
        setResolutionModalState((prev) => ({ ...prev, open: false }));
      } catch {
        // Error toast is already handled inside useResolveReceiptException
      }
      return;
    }

    // Fallback to local state when testing with local/mock fulfillments without a receipt ID
    const itemsMap: Record<string, LineItemResolution> = {};
    for (const r of payload.resolutions) {
      itemsMap[r.purchaseOrderLineItemId] = r;
    }

    setLocalResolutions((prev) => {
      const existingItems = prev[fId]?.itemResolutions || {};
      const mergedItems = { ...existingItems, ...itemsMap };

      const actions = Object.values(mergedItems).map((i) => i.action);
      const hasDispute = actions.includes("dispute");
      const hasBackorder = actions.includes("backorder");
      const hasForfeit = actions.includes("forfeit");

      let status: "acknowledged" | "disputed" | "mixed" = "acknowledged";
      if (hasDispute && (hasBackorder || hasForfeit)) status = "mixed";
      else if (hasDispute) status = "disputed";
      else status = "acknowledged";

      return {
        ...prev,
        [fId]: {
          status,
          action: status,
          type: status,
          itemResolutions: mergedItems,
        },
      };
    });

    const disputedCount = payload.resolutions.filter((r) => r.action === "dispute").length;
    const ackCount = payload.resolutions.filter((r) => r.action === "backorder" || r.action === "forfeit").length;

    if (disputedCount > 0 && ackCount > 0) {
      toast.success(`Resolution recorded: ${disputedCount} disputed, ${ackCount} acknowledged.`);
    } else if (disputedCount > 0) {
      toast.success(`Dispute submitted for ${disputedCount} item${disputedCount > 1 ? "s" : ""}.`);
    } else {
      toast.success(`Acknowledged resolution for ${ackCount} item${ackCount > 1 ? "s" : ""}.`);
    }

    setResolutionModalState((prev) => ({ ...prev, open: false }));
  };

  const rawNotices: Fulfillment[] = order.fulfillments || order.deliveryNotices || [];
  const combinedReceipts: FulfillmentExceptionDetail[] = [
    ...(order.receiptConfirmations || []),
    ...(order.receipts || []),
    ...(order.deliveryReceipts || []),
    ...(receiptExceptions || []),
  ];
  const allNotices: Fulfillment[] = enrichFulfillmentsWithReceipts(rawNotices, combinedReceipts);

  // Classify every fulfillment using the explicit 6-state lifecycle
  const classifiedNotices = allNotices.map((f, idx) => ({
    fulfillment: f,
    index: idx,
    ...deriveFulfillmentExplicitState(f, localResolutions[f.vendorDeliveryNoticeId]),
  }));

  // 1. Shipments staged as Submitted (physical goods awaiting dispatch)
  const awaitingDispatchNotices = classifiedNotices.filter(
    (item) => item.state === "submitted" && !item.fulfillment.bypassDeliveryLock
  );

  // 2. Shipments Dispatched / Submitted awaiting buyer receipt confirmation
  const awaitingReceiptNotices = classifiedNotices.filter(
    (item) => item.state === "awaiting_receipt" && !item.fulfillment.bypassDeliveryLock
  );

  // 3. Shipments with final decision issued awaiting vendor disposition (accept-final-decision)
  const finalDecisionNotices = classifiedNotices
    .filter((item) => item.state === "final_decision_received" && !item.fulfillment.bypassDeliveryLock)
    .map((item) => {
      const unresolvedUnits = item.fulfillment.lineItems.reduce(
        (sum, li) => sum + getLineUnresolvedQty(li as any, item.fulfillment),
        0
      );
      return {
        fulfillment: item.fulfillment,
        index: item.index,
        unresolvedUnits,
        totalExceptionUnits: item.totalExceptionUnits,
      };
    });

  // 4. Shipments with vendor dispute currently under company review
  const underReviewNotices = classifiedNotices.filter(
    (item) => item.state === "disputed" && !item.fulfillment.bypassDeliveryLock
  );

  // 5. Shipments with fresh buyer exceptions awaiting vendor response (action_required)
  const activeRejectionNotices = classifiedNotices
    .filter((item) => item.state === "action_required" && !item.fulfillment.bypassDeliveryLock)
    .map((item) => {
      const unresolvedUnits = item.fulfillment.lineItems.reduce(
        (sum, li) => sum + getLineUnresolvedQty(li as any, item.fulfillment),
        0
      );
      const rejectedSum = item.fulfillment.lineItems.reduce(
        (sum, li) => sum + (li.quantityRejected || 0),
        0
      );
      const missingSum = item.fulfillment.lineItems.reduce(
        (sum, li) => sum + (li.quantityMissing || 0),
        0
      );
      return {
        fulfillment: item.fulfillment,
        index: item.index,
        totalRejected:
          item.fulfillment.totalRejectedQuantity ??
          (rejectedSum > 0 || missingSum > 0
            ? rejectedSum
            : Math.max(0, item.totalShipped - item.totalAccepted)),
        totalMissing: item.fulfillment.totalMissingQuantity ?? missingSum,
        totalExceptionUnits: item.totalExceptionUnits,
        unresolvedUnits: unresolvedUnits > 0 ? unresolvedUnits : item.totalExceptionUnits,
      };
    });

  const totalAllRejected = activeRejectionNotices.reduce(
    (acc, item) => acc + item.totalExceptionUnits,
    0
  );

  const totalAllUnresolved =
    finalDecisionNotices.reduce((acc, item) => acc + item.unresolvedUnits, 0) +
    activeRejectionNotices.reduce((acc, item) => acc + item.unresolvedUnits, 0);

  // ── 5 Distinct PO Quantity Buckets ──
  // Ordered, Shipped, Confirmed Received, Disputed, Remaining
  const poQuantities = (() => {
    const ordered =
      order.quantityOrdered ??
      order.lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);

    const activeFulfillments = classifiedNotices.filter((n) => n.state !== "cancelled");
    const shippedFromNotices = activeFulfillments.reduce((sum, n) => sum + n.totalShipped, 0);
    const shipped =
      shippedFromNotices > 0
        ? shippedFromNotices
        : order.lineItems.reduce(
            (sum, li) => sum + (li.quantityReady ?? li.quantityDispatched ?? 0),
            0
          );

    const confirmedFromLines = order.lineItems.reduce(
      (sum, li) => sum + (li.quantityAccepted ?? li.quantityReceived ?? 0),
      0
    );
    const confirmedFromNotices = activeFulfillments.reduce(
      (sum, n) => sum + n.totalAccepted,
      0
    );
    const confirmedReceived = Math.max(confirmedFromLines, confirmedFromNotices);

    const disputed = classifiedNotices
      .filter((n) => n.state === "disputed")
      .reduce((sum, n) => {
        const contestedFromLines = n.fulfillment.lineItems.reduce(
          (lSum, li) => lSum + getLineContestedDisputeQty(li, n.fulfillment),
          0
        );
        return sum + (contestedFromLines > 0 ? contestedFromLines : n.totalExceptionUnits);
      }, 0);

    const remaining = order.lineItems.reduce(
      (sum, li) => sum + getRemainingToReady(li),
      0
    );

    const backordered = order.lineItems.reduce(
      (sum, li) =>
        li.remainingDisposition === "backordered"
          ? sum + getRemainingToReady(li)
          : sum,
      0
    );

    const notStarted = order.lineItems.reduce(
      (sum, li) =>
        !li.remainingDisposition && (li.quantityReady ?? li.quantityDispatched ?? 0) === 0
          ? sum + getRemainingToReady(li)
          : sum,
      0
    );

    const awaitingConfirmation = awaitingReceiptNotices.reduce(
      (sum, n) => sum + Math.max(0, n.totalShipped - n.totalAccepted),
      0
    );

    const alreadyInvoiced = invoices
      .filter((inv) => inv.status !== "rejected")
      .reduce(
        (sum, inv) =>
          sum + (inv.lineItems || []).reduce((s, li) => s + (li.quantity || 0), 0),
        0
      );

    const availableToInvoice = Math.max(0, confirmedReceived - alreadyInvoiced);

    return {
      ordered,
      shipped,
      confirmedReceived,
      disputed,
      remaining,
      backordered,
      notStarted,
      awaitingConfirmation,
      alreadyInvoiced,
      availableToInvoice,
    };
  })();

  // ── Strict Incomplete Fulfillment Delivery Lock ──
  // Rule: If a fulfillment is not fully completed on an order, a new fulfillment cannot be created.
  // A fulfillment is incomplete if it is staged awaiting dispatch, awaiting buyer confirmation,
  // has unresolved exceptions (vendor action required), or has an active dispute under review.
  const hasConfigurableOverride = order.allowConcurrentDeliveries === true;

  const deliveryEligibility = (() => {
    if (!hasItemsToFulfill || poQuantities.remaining <= 0) {
      return {
        canCreateDelivery: false,
        blockReason: "po_fully_fulfilled" as const,
        blockLabel: "PO Fully Fulfilled",
      };
    }
    if (order.canCreateFulfillment === false) {
      return {
        canCreateDelivery: false,
        blockReason: "backend_blocked" as const,
        blockLabel: order.fulfillmentBlockReason || "Delivery Restricted",
      };
    }
    if (hasConfigurableOverride) {
      return {
        canCreateDelivery: true,
        blockReason: null,
        blockLabel: null,
      };
    }
    if (awaitingDispatchNotices.length > 0) {
      const target = awaitingDispatchNotices[0];
      return {
        canCreateDelivery: false,
        blockReason: "awaiting_dispatch" as const,
        blockLabel: `Dispatch Shipment #${target.index + 1} First`,
        blockingShipmentIndex: target.index + 1,
        blockingFulfillment: target.fulfillment,
      };
    }
    if (finalDecisionNotices.length > 0) {
      const target = finalDecisionNotices[0];
      return {
        canCreateDelivery: false,
        blockReason: "final_decision_allocation_required" as const,
        blockLabel: `Allocate Shipment #${target.index + 1} Ruling First`,
        blockingShipmentIndex: target.index + 1,
        blockingFulfillment: target.fulfillment,
      };
    }
    if (activeRejectionNotices.length > 0) {
      const target = activeRejectionNotices[0];
      return {
        canCreateDelivery: false,
        blockReason: "exception_action_required" as const,
        blockLabel: `Resolve Shipment #${target.index + 1} Discrepancy First`,
        blockingShipmentIndex: target.index + 1,
        blockingFulfillment: target.fulfillment,
      };
    }
    if (underReviewNotices.length > 0) {
      const target = underReviewNotices[0];
      return {
        canCreateDelivery: false,
        blockReason: "disputed" as const,
        blockLabel: `Shipment #${target.index + 1} Dispute Under Review`,
        blockingShipmentIndex: target.index + 1,
        blockingFulfillment: target.fulfillment,
      };
    }
    if (awaitingReceiptNotices.length > 0) {
      const target = awaitingReceiptNotices[0];
      return {
        canCreateDelivery: false,
        blockReason: "awaiting_receipt" as const,
        blockLabel: `Awaiting Shipment #${target.index + 1} Confirmation`,
        blockingShipmentIndex: target.index + 1,
        blockingFulfillment: target.fulfillment,
      };
    }
    return {
      canCreateDelivery: true,
      blockReason: null,
      blockLabel: null,
    };
  })();

  const handleQuickDispatch = (fulfillmentId: string) => {
    dispatchFulfillmentMutation.mutate({
      purchaseOrderId: order.purchaseOrderId,
      fulfillmentId,
      payload: {
        dispatchReference: `DSP-${crypto.randomUUID().slice(0, 8)}`,
        dispatchedAt: new Date().toISOString(),
      },
    });
  };

  const renderCTA = () => {
    const buttons = [];

    // 1. Initial Vendor Response Actions (Pre-acknowledgement only)
    if (order.status === "issued") {
      if (hasPendingPriceProposal) {
        // Commercial Invariant: Acknowledgement is paused while a price proposal is under review
        buttons.push(
          <Button
            key="view-pending-proposal"
            variant="outline"
            onClick={() =>
              setPriceProposalModalState({
                open: true,
                mode: "view",
                requestId: activePriceChangeRequest.priceChangeRequestId,
              })
            }
          >
            <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
            View Pending Proposal
          </Button>
        );
      } else if (acknowledging) {
        // Date entry mode: confirm or cancel
        buttons.push(
          <Button
            key="cancel-ack"
            variant="ghost"
            onClick={() => setAcknowledging(false)}
          >
            Cancel
          </Button>,
          <Button
            key="confirm-acknowledge"
            variant="primary"
            loading={acknowledge.isPending}
            disabled={!allDatesEntered}
            onClick={handleAcknowledge}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Confirm Acknowledgement
          </Button>
        );
      } else {
        // Standard issued PO actions
        buttons.push(
          <Button
            key="acknowledge"
            variant="primary"
            onClick={() => setAcknowledging(true)}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Acknowledge Order
          </Button>
        );
        if (canProposeInitialPrice) {
          buttons.push(
            <Button
              key="propose-price"
              variant="outline"
              onClick={() =>
                setPriceProposalModalState({
                  open: true,
                  mode: "create",
                  requestId: null,
                })
              }
            >
              <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
              Request Price Change
            </Button>
          );
        }
      }
    }

    // 2. Fulfill Action (Governed by Strict Incomplete Fulfillment Lock)
    if (
      [
        "acknowledged",
        "ready_for_delivery",
        "partially_delivered",
        "partially_delivered_with_exceptions",
        "delivered_with_exceptions",
      ].includes(order.status) &&
      hasItemsToFulfill
    ) {
      const isSubsequent = allNotices.filter((n) => n.status !== "cancelled").length > 0;
      if (deliveryEligibility.canCreateDelivery) {
        buttons.push(
          <DeliveryTypeMenu
            key="fulfill"
            isConfirmingFull={createFulfillment.isPending}
            onSelect={handleDeliveryTypeSelect}
            trigger={
              <Button
                variant="primary"
                loading={createFulfillment.isPending || dispatchFulfillmentMutation.isPending}
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                {isSubsequent
                  ? `Fulfill Remaining (${poQuantities.remaining})`
                  : "Declare Fulfillment"}
              </Button>
            }
          />
        );
      } else {
        const isAllocationBlock =
          deliveryEligibility.blockReason === "final_decision_allocation_required";
        const lockButtonLabel = isAllocationBlock
          ? "Fulfill Remaining (Blocked)"
          : deliveryEligibility.blockLabel || "Fulfill Remaining (Locked)";
        const lockTooltip =
          deliveryEligibility.blockReason === "final_decision_allocation_required"
            ? `Allocate Shipment #${deliveryEligibility.blockingShipmentIndex || 1} ruling before declaring a new fulfillment.`
            : deliveryEligibility.blockReason === "exception_action_required"
            ? "Cannot create a new fulfillment until open exceptions on the current shipment are resolved."
            : deliveryEligibility.blockReason === "awaiting_receipt"
            ? "A vendor can have only one active, unconfirmed delivery at a time. Wait for buyer receipt confirmation."
            : deliveryEligibility.blockReason === "disputed"
            ? "Further deliveries are restricted until the open delivery dispute is resolved."
            : deliveryEligibility.blockReason === "awaiting_dispatch"
            ? "Dispatch the ready shipment before declaring a new fulfillment."
            : "New fulfillment cannot be created while previous fulfillments remain incomplete.";

        // If an allocation or dispute resolution is actively pending in the top banner,
        // do not render a distracting locked fulfillment button.
        if (
          deliveryEligibility.blockReason !== "final_decision_allocation_required" &&
          deliveryEligibility.blockReason !== "exception_action_required" &&
          deliveryEligibility.blockReason !== "disputed"
        ) {
          buttons.push(
            <Button
              key="fulfill-locked"
              variant="outline"
              disabled
              title={lockTooltip}
              className="opacity-75 cursor-not-allowed text-xs font-medium border-border/80 bg-muted/40 text-muted-foreground"
            >
              <Lock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
              {lockButtonLabel}
            </Button>
          );
        }
      }
    }

    // 3. Invoice Actions
    if (
      canCreateInvoice &&
      awaitingDispatchNotices.length === 0 &&
      activeRejectionNotices.length === 0 &&
      underReviewNotices.length === 0 &&
      (poQuantities.availableToInvoice > 0 || invoices.length === 0)
    ) {
      buttons.push(
        <Button key="create-invoice" asChild variant={buttons.length > 0 ? "outline" : "primary"}>
          <Link href={`/invoices/create?purchaseOrderId=${order.purchaseOrderId}`}>
            <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
            {poQuantities.availableToInvoice > 0
              ? `Create Invoice (${poQuantities.availableToInvoice})`
              : "Create Invoice"}
          </Link>
        </Button>
      );
    } else if (invoices.length > 0) {
      buttons.push(
        <Button key="view-invoices" asChild variant="outline">
          <Link href={`/invoices?purchaseOrderId=${order.purchaseOrderId}`}>
            <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
            View Invoices
          </Link>
        </Button>
      );
    }

    // Note: When finalDecisionNotices.length > 0, the dedicated Final Determination Banner
    // directly below the header already renders the primary CTA "Allocate Remaining (X units)".
    // Omitting it here prevents showing two duplicate green buttons stacked next to each other.

    // 4. Post-acknowledgement Price Amendment Actions (Formal amendment for outstanding quantities)
    if (!isPreAcknowledgement && !isTerminalOrder) {
      if (hasPendingPriceProposal) {
        buttons.push(
          <Button
            key="view-pending-amendment"
            variant="outline"
            onClick={() =>
              setPriceProposalModalState({
                open: true,
                mode: "view",
                requestId: activePriceChangeRequest.priceChangeRequestId,
              })
            }
          >
            <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
            View Pending Amendment
          </Button>
        );
      } else if (canRequestPriceAmendment) {
        buttons.push(
          <Button
            key="request-amendment"
            variant="outline"
            onClick={() =>
              setPriceProposalModalState({
                open: true,
                mode: "create",
                requestId: null,
              })
            }
          >
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
            Request Price Amendment
          </Button>
        );
      } else if (poQuantities.remaining > 0) {
        const lockReason =
          priceEligibility?.reason ||
          (order.openExceptionCount && order.openExceptionCount > 0
            ? "Price amendments are locked while open delivery exceptions remain unresolved."
            : "No line items are currently eligible for price amendments.");

        buttons.push(
          <Button
            key="request-amendment-locked"
            variant="outline"
            onClick={() =>
              setPriceProposalModalState({
                open: true,
                mode: "create",
                requestId: null,
              })
            }
            title={lockReason}
            className="opacity-75 text-xs font-medium border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted"
          >
            <Lock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
            Price Amendment (Locked)
          </Button>
        );
      }
    }

    return <>{buttons}</>;
  };

  const isEnteringDates = order.status === "issued" && acknowledging;

  return (
    <div className="space-y-5">
      {/* ── Sticky Header ── */}
      <div className="lg:sticky lg:top-0 z-20 bg-dashboard-bg/95 backdrop-blur-sm -mx-4 px-4 sm:-mx-6 sm:px-6 -mt-4 pt-4 sm:-mt-6 sm:pt-6 pb-4 border-b border-border mb-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <button onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0 mt-0.5 sm:mt-0">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold break-words">{order.poNumber}</h1>
                {order.deliveryOutcome &&
                order.deliveryOutcome !== "not_delivered" &&
                !["cancelled", "closed"].includes(order.status) ? (
                  <DeliveryStatusBadge
                    status={order.deliveryOutcome}
                    isResolved={
                      (order.openExceptionCount ?? 0) === 0 &&
                      order.vendorResponseRequired === false &&
                      activeRejectionNotices.length === 0 &&
                      finalDecisionNotices.length === 0 &&
                      underReviewNotices.length === 0
                    }
                  />
                ) : order.resolutionStatus && order.resolutionStatus !== "not_required" ? (
                  <ExceptionResolutionBadge status={order.resolutionStatus} />
                ) : (
                  <OrderStatusBadge
                    status={order.status}
                    isResolved={
                      (order.openExceptionCount ?? 0) === 0 &&
                      order.vendorResponseRequired === false &&
                      activeRejectionNotices.length === 0 &&
                      finalDecisionNotices.length === 0 &&
                      underReviewNotices.length === 0
                    }
                  />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Issued on {formatDate(order.issueDate)} · Revision {order.revisionNumber ?? 1}
                </p>
                {order.fulfillmentState === "backordered" && (
                  <>
                    <span className="text-xs text-muted-foreground" aria-hidden="true">•</span>
                    <span className="text-xs text-amber-700 font-medium">Contains backordered items</span>
                  </>
                )}
                {order.fulfillmentState === "cannot_fulfill" && (
                  <>
                    <span className="text-xs text-muted-foreground" aria-hidden="true">•</span>
                    <span className="text-xs text-red-700 font-medium">Contains unfulfilled items</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">{renderCTA()}</div>
        </div>
      </div>

      {/* ── Price Change Proposal / PO Amendment Under Review Banner ── */}
      {hasPendingPriceProposal && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-amber-950">
                  {isPreAcknowledgement
                    ? "Price change proposal is under buyer review"
                    : "PO price amendment request is under buyer review"}
                </p>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-200/70 text-amber-900 border border-amber-300">
                  {activePriceChangeRequest.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                {isPreAcknowledgement
                  ? "Order acknowledgement is paused until the proposal is resolved or withdrawn."
                  : "Goods already delivered and accepted remain protected under original terms. Outstanding backordered quantities will update upon buyer approval and PO reissue."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPriceProposalModalState({
                  open: true,
                  mode: "view",
                  requestId: activePriceChangeRequest.priceChangeRequestId,
                })
              }
            >
              {isPreAcknowledgement ? "View Proposal" : "View Amendment"}
            </Button>
            {["pending_review", "returned_for_correction"].includes(activePriceChangeRequest.status) && (
              <Button
                variant="destructive"
                size="sm"
                loading={withdrawProposalMutation.isPending}
                onClick={async () => {
                  try {
                    await withdrawProposalMutation.mutateAsync({
                      requestId: activePriceChangeRequest.priceChangeRequestId,
                      expectedVersion: 1,
                    });
                  } catch {
                    // Handled in mutation
                  }
                }}
              >
                Withdraw Request
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Acknowledgement Date Entry Helper Banner ── */}
      {order.status === "issued" && acknowledging && (
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                Confirming Order Acknowledgement
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Please enter your promised delivery date for each line item below, then click Confirm Acknowledgement.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAcknowledging(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* ── Guided Physical Dispatch Banner (Single Primary Dispatch Action, No Duplicate Header Button) ── */}
      {awaitingDispatchNotices.length > 0 && order.status !== "cancelled" && (() => {
        const target = awaitingDispatchNotices[0];
        const fId = target.fulfillment.vendorDeliveryNoticeId;
        const isCurrentDispatching =
          dispatchFulfillmentMutation.isPending &&
          dispatchFulfillmentMutation.variables?.fulfillmentId === fId;

        return (
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-amber-950">
                    Shipment #{target.index + 1} is staged as ready ({pluralizeUnits(target.totalShipped)}) — physical dispatch required
                  </p>
                </div>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Mark this shipment as <strong>Dispatched</strong> once the goods leave your facility so the buyer can inspect and confirm receipt.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={isCurrentDispatching}
                onClick={() => handleQuickDispatch(fId)}
                className="h-9 px-4 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white border-none shadow-xs"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Dispatch Shipment #{target.index + 1} Now
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ── Awaiting Buyer Receipt Confirmation Banner (One Active Delivery Rule) ── */}
      {awaitingDispatchNotices.length === 0 &&
        activeRejectionNotices.length === 0 &&
        awaitingReceiptNotices.length > 0 &&
        order.status !== "cancelled" && (() => {
          const target = awaitingReceiptNotices[0];
          return (
            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-3 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0 mt-0.5">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-blue-950">
                        Shipment #{target.index + 1} is awaiting buyer receipt confirmation
                      </p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-900">
                        Awaiting Receipt
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                      {poQuantities.remaining > 0
                        ? `Only one unconfirmed delivery can be active at a time. Once the buyer confirms receipt of Shipment #${target.index + 1}, you can initiate the next delivery for the remaining ${pluralizeUnits(poQuantities.remaining)} or create an invoice.`
                        : `All ordered units have been shipped. Once the buyer inspects and confirms receipt of Shipment #${target.index + 1}, you can generate your invoice.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5-Bucket Quantity Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-blue-200/60">
                <div className="px-3 py-2 rounded-lg bg-white/80 border border-blue-100">
                  <p className="text-[11px] text-muted-foreground">Ordered Qty</p>
                  <p className="text-sm font-bold text-foreground">{pluralizeUnits(poQuantities.ordered)}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/80 border border-blue-100">
                  <p className="text-[11px] text-muted-foreground">Shipped Qty</p>
                  <p className="text-sm font-bold text-blue-700">{pluralizeUnits(poQuantities.shipped)}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/80 border border-blue-100">
                  <p className="text-[11px] text-muted-foreground">Confirmed Received</p>
                  <p className="text-sm font-bold text-emerald-700">{pluralizeUnits(poQuantities.confirmedReceived)}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/80 border border-blue-100">
                  <p className="text-[11px] text-muted-foreground">Disputed Qty</p>
                  <p className="text-sm font-bold text-purple-700">{pluralizeUnits(poQuantities.disputed)}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/80 border border-blue-100 col-span-2 sm:col-span-1">
                  <p className="text-[11px] text-muted-foreground">Remaining Qty</p>
                  <p className="text-sm font-bold text-amber-700">{pluralizeUnits(poQuantities.remaining)}</p>
                  {(poQuantities.backordered > 0 || poQuantities.notStarted > 0) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {[
                        poQuantities.backordered > 0 ? `${poQuantities.backordered} backordered` : null,
                        poQuantities.notStarted > 0 ? `${poQuantities.notStarted} not started` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Final Determination / Ruling Banner (Vendor Allocation Required Post-Dispute) ── */}
      {awaitingDispatchNotices.length === 0 &&
        finalDecisionNotices.length > 0 &&
        order.status !== "cancelled" && (() => {
          const target = finalDecisionNotices[0];
          const f = target.fulfillment;
          const decisionLabel = formatFinalDecisionLabel(f.finalDecision);
          const unresolvedUnits = target.unresolvedUnits;
          return (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/95 border border-amber-300 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-3 border-b border-amber-200/80">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-amber-950">
                        Shipment #{target.index + 1} Dispute Concluded — Buyer Ruling: {decisionLabel}
                      </p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                        Allocation Required ({pluralizeUnits(unresolvedUnits)})
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      {f.finalDecision === "revise_buyer_finding"
                        ? "The buyer has concluded their review and revised their inspection findings."
                        : "The buyer has concluded their review and upheld their inspection findings."}{" "}
                      You can no longer dispute these items. Choose to <strong>backorder</strong> (send replacement units) or <strong>forfeit</strong> (write off) the remaining {pluralizeUnits(unresolvedUnits)} to complete the resolution.
                    </p>
                    {f.resolutionNote && (
                      <p className="text-xs text-amber-900 font-medium mt-1">
                        <span className="font-bold">Buyer determination note: </span>
                        {f.resolutionNote}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-start pl-11 sm:pl-0 pt-0.5">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenFinalDecision(f, target.index)}
                    className="h-8.5 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                  >
                    Allocate Remaining ({pluralizeUnits(unresolvedUnits)})
                  </Button>
                </div>
              </div>
              <div className="pl-0 sm:pl-11 space-y-2">
                <ExceptionBreakdown
                  fulfillment={f}
                  unresolvedOnly
                  local={localResolutions[f.vendorDeliveryNoticeId]}
                />
                {f.lineItems.some(
                  (li) =>
                    (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0 &&
                    isLineAlreadyResolved(li as any, f)
                ) && (
                  <p className="text-[11px] text-amber-900/80 pt-1">
                    <span className="font-semibold">Previously resolved on this shipment: </span>
                    {f.lineItems
                      .filter(
                        (li) =>
                          (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0 &&
                          isLineAlreadyResolved(li as any, f)
                      )
                      .map((li) => {
                        const alloc = getLineAllocatedQty(li as any, f);
                        const parts: string[] = [];
                        if (alloc.backorder > 0) parts.push(`${alloc.backorder} Backorder${alloc.backorder > 1 ? "s" : ""}`);
                        if (alloc.forfeit > 0) parts.push(`${alloc.forfeit} Forfeit${alloc.forfeit > 1 ? "ed" : ""}`);
                        return `${li.name}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
                      })
                      .join(", ")}
                  </p>
                )}
                {f.evidence && f.evidence.length > 0 && (
                  <div className="pt-1">
                    <EvidenceGallery buyerEvidence={f.evidence} variant="pill" />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* ── Dispute Under Company Review Banner (Blocks Subsequent Deliveries Until Resolved) ── */}
      {awaitingDispatchNotices.length === 0 &&
        finalDecisionNotices.length === 0 &&
        activeRejectionNotices.length === 0 &&
        underReviewNotices.length > 0 &&
        order.status !== "cancelled" && (() => {
          const target = underReviewNotices[0];
          const targetUnresolvedUnits = target.fulfillment.lineItems.reduce(
            (sum, li) => sum + getLineUnresolvedQty(li as any, target.fulfillment),
            0
          );
          return (
            <div className="p-4 rounded-2xl bg-purple-50/85 border border-purple-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700 shrink-0 mt-0.5">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-purple-950">
                      Shipment #{target.index + 1} dispute is under buyer review ({pluralizeUnits(poQuantities.disputed)} disputed)
                    </p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-200/70 text-purple-900">
                      Disputed · Delivery Locked
                    </span>
                  </div>
                  <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                    Further deliveries and invoicing for disputed units remain restricted until the buyer resolves the discrepancy or explicitly authorizes continuation.
                  </p>
                  {targetUnresolvedUnits > 0 && (
                    <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-purple-900">
                        Note: {pluralizeUnits(targetUnresolvedUnits)} on this shipment still {targetUnresolvedUnits === 1 ? "requires" : "require"} resolution.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenResolution(target.fulfillment, target.index, null, "backorder")}
                        className="h-8 px-3 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white"
                      >
                        Resolve Remaining ({pluralizeUnits(targetUnresolvedUnits)})
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Partial Receipt Confirmed Status Bar (No Duplicate Buttons — Actions Live in Sticky Header) ── */}
      {awaitingDispatchNotices.length === 0 &&
        finalDecisionNotices.length === 0 &&
        activeRejectionNotices.length === 0 &&
        underReviewNotices.length === 0 &&
        awaitingReceiptNotices.length === 0 &&
        poQuantities.confirmedReceived > 0 &&
        poQuantities.remaining > 0 &&
        order.status !== "cancelled" &&
        order.status !== "closed" && (
          <div className="px-4 py-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-900 leading-relaxed">
                <strong className="font-semibold text-emerald-950">
                  Receipt confirmed for {poQuantities.confirmedReceived} of {pluralizeUnits(poQuantities.ordered)}
                </strong>{" "}
                — you can now deliver the remaining{" "}
                <strong className="font-semibold text-emerald-950">
                  {pluralizeUnits(poQuantities.remaining)}
                </strong>
                {poQuantities.availableToInvoice > 0 ? (
                  <>
                    {" "}or invoice for the{" "}
                    <strong className="font-semibold text-emerald-950">
                      {pluralizeUnits(poQuantities.availableToInvoice)} confirmed
                    </strong>
                    .
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[11px] font-medium">
              <span className="px-2 py-0.5 rounded-md bg-white/80 text-emerald-800 border border-emerald-200">
                {pluralizeUnits(poQuantities.confirmedReceived)} Confirmed
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/80 text-amber-800 border border-amber-200">
                {pluralizeUnits(poQuantities.remaining)} Remaining
              </span>
            </div>
          </div>
        )}

      {/* ── Single Shipment Exception Banner (Vendor Action Required) ── */}
      {finalDecisionNotices.length === 0 && activeRejectionNotices.length === 1 && (() => {
        const {
          fulfillment,
          index,
          totalRejected,
          totalMissing,
          totalExceptionUnits,
          unresolvedUnits,
        } = activeRejectionNotices[0];
        const summaryParts = [
          totalRejected > 0
            ? `${totalRejected} rejected unit${totalRejected > 1 ? "s" : ""}`
            : null,
          totalMissing > 0
            ? `${totalMissing} missing unit${totalMissing > 1 ? "s" : ""}`
            : null,
        ].filter(Boolean);
        const summaryLabel =
          summaryParts.join(" and ") ||
          `${totalExceptionUnits} exception unit${totalExceptionUnits > 1 ? "s" : ""}`;
        const hasPartial = unresolvedUnits < totalExceptionUnits && unresolvedUnits > 0;
        const parsedReason = parseExceptionReason(
          fulfillment.rejectionReason || getUniqueLineReasons(fulfillment.lineItems)
        );

        return (
          <div
            key={fulfillment.vendorDeliveryNoticeId}
            className="p-4 sm:p-5 rounded-2xl bg-red-50/95 border border-red-200 shadow-xs space-y-3.5"
          >
            {/* Top Header Row: Buyer Report on Shipment + Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-red-100 text-red-600 shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-red-950">
                      Buyer reported {summaryLabel} on Shipment #{index + 1}
                    </p>
                  </div>
                  <p className="text-xs text-red-700/90 mt-0.5">
                    {hasPartial
                      ? `${pluralizeUnits(unresolvedUnits)} still pending resolution (${totalExceptionUnits - unresolvedUnits} already resolved or under review). Choose backorder or forfeit.`
                      : "Resolve this shipment discrepancy by sending replacements (backorder), writing off (forfeit), or disputing the buyer's inspection findings."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-11 sm:pl-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenResolution(fulfillment, index, null, "dispute")}
                  className="h-8.5 px-3.5 text-xs font-semibold border-purple-300 text-purple-700 bg-white/80 hover:bg-purple-50"
                >
                  Dispute All
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenResolution(fulfillment, index, null, "backorder")}
                  className="h-8.5 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                >
                  Review & Resolve ({pluralizeUnits(unresolvedUnits)})
                </Button>
              </div>
            </div>

            {/* Body: Line Items Breakdown & Evidence Gallery */}
            <div className="pl-0 sm:pl-11 space-y-2">
              <ExceptionBreakdown fulfillment={fulfillment} unresolvedOnly={hasPartial} />
              {hasPartial && (
                <p className="text-[11px] text-red-900/80 pt-1">
                  <span className="font-semibold">Previously resolved on this shipment: </span>
                  {fulfillment.lineItems
                    .filter((li) => isLineAlreadyResolved(li as any, fulfillment))
                    .map((li) => {
                      const alloc = getLineAllocatedQty(li as any, fulfillment);
                      const parts: string[] = [];
                      if (alloc.backorder > 0) parts.push(`${alloc.backorder} Backorder${alloc.backorder > 1 ? "s" : ""}`);
                      if (alloc.forfeit > 0) parts.push(`${alloc.forfeit} Forfeit${alloc.forfeit > 1 ? "ed" : ""}`);
                      return `${li.name}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
                    })
                    .join(", ")}
                </p>
              )}
              {fulfillment.evidence && fulfillment.evidence.length > 0 && (
                <div className="pt-1">
                  <EvidenceGallery
                    buyerEvidence={fulfillment.evidence}
                    variant="pill"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Consolidated Multi-Shipment Exception Banner (When 2+ Shipments Have Exceptions) ── */}
      {finalDecisionNotices.length === 0 && activeRejectionNotices.length > 1 && (
        <div className="rounded-2xl bg-red-50/90 border border-red-200 overflow-hidden shadow-xs">
          {/* Compact Summary Header with Expand/Collapse Toggle */}
          <div className="p-4 bg-red-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-200/80 text-red-700 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-red-900">
                    Buyer reported exceptions on {activeRejectionNotices.length} shipments ({totalAllRejected} total exception units)
                  </h3>
                </div>
                <p className="text-xs text-red-700 mt-0.5">
                  Each shipment with exceptions needs your response (backorder, forfeit, or dispute).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMultiBannerExpanded((prev) => !prev)}
                className="h-8.5 px-3.5 text-xs font-semibold border-red-300 bg-white/80 text-red-800 hover:bg-white"
              >
                {multiBannerExpanded
                  ? "Hide shipments"
                  : `View ${activeRejectionNotices.length} shipments`}
                {multiBannerExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                )}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  handleOpenResolution(
                    activeRejectionNotices[0].fulfillment,
                    activeRejectionNotices[0].index,
                    null,
                    "backorder"
                  )
                }
                className="h-8.5 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
              >
                Resolve Next Shipment
              </Button>
            </div>
          </div>

          {/* Collapsible Grouped Shipments List */}
          {multiBannerExpanded && (
            <div className="divide-y divide-red-200/60 bg-white/70 border-t border-red-200/80">
              {activeRejectionNotices.map(
                ({ fulfillment, index, totalRejected, totalMissing, totalExceptionUnits }) => {
                  const parsedReason = parseExceptionReason(
          fulfillment.rejectionReason || getUniqueLineReasons(fulfillment.lineItems)
        );
                  return (
                    <div
                      key={fulfillment.vendorDeliveryNoticeId}
                      className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/95 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground">
                            Shipment #{index + 1}
                          </span>
                          {totalRejected > 0 && (
                            <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              {totalRejected} rejected
                            </span>
                          )}
                          {totalMissing > 0 && (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              {totalMissing} missing
                            </span>
                          )}
                          {totalRejected === 0 && totalMissing === 0 && (
                            <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              {totalExceptionUnits} exception units
                            </span>
                          )}
                          {fulfillment.evidence && fulfillment.evidence.length > 0 && (
                            <EvidenceGallery
                              buyerEvidence={fulfillment.evidence}
                              variant="pill"
                            />
                          )}
                        </div>
                        {(parsedReason.category || parsedReason.text) && (
                          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Reason:</span>
                            {parsedReason.categories && parsedReason.categories.length > 0 ? (
                              parsedReason.categories.map((cat, i) => (
                                <span
                                  key={i}
                                  className="font-semibold text-[11px] bg-red-100 text-red-900 px-2 py-0.5 rounded-md"
                                >
                                  {cat}
                                </span>
                              ))
                            ) : parsedReason.category ? (
                              <span className="font-semibold text-[11px] bg-red-100 text-red-900 px-2 py-0.5 rounded-md">
                                {parsedReason.category}
                              </span>
                            ) : null}
                            {parsedReason.text &&
                          !parsedReason.category?.toLowerCase().includes(parsedReason.text.toLowerCase()) && (
                            <span>{parsedReason.text}</span>
                          )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenResolution(fulfillment, index, null, "dispute")}
                          className="h-8 px-3.5 text-xs font-semibold border-purple-300 text-purple-700 hover:bg-purple-50"
                        >
                          Dispute All
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenResolution(fulfillment, index, null, "backorder")}
                          className="h-8 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                        >
                          Review & Resolve
                        </Button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      )}

      {isEnteringDates && (
        <div className={cn(
          "text-xs font-medium rounded-lg px-3 py-2 border",
          allDatesEntered
            ? "bg-blue-50 text-blue-700 border-blue-100"
            : "text-amber-700 bg-amber-50 border-amber-100"
        )}>
          {allDatesEntered
            ? "Promise dates are pre-filled with the expected delivery schedule. You can adjust dates if needed before acknowledging."
            : "Please verify or select the promise date for every item below before acknowledging."}
        </div>
      )}

      {order.status === "cancelled" && (
        <div className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          This order was withdrawn{order.rejectionReason ? `: ${order.rejectionReason}` : "."}
        </div>
      )}
      {order.issueBlockers && order.issueBlockers.length > 0 && (
        <div className="text-xs text-amber-700 font-medium bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {order.issueBlockers.join(" · ")}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-5">
        <div className="space-y-4 min-w-0">
          {/* ── Order Details Card ── */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-4 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold">Order Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Requester</p>
                <p className="text-sm font-semibold mt-0.5">{order.requesterName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="text-sm font-semibold mt-0.5">{order.departmentName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="text-sm font-semibold mt-0.5">{formatDate(order.promisedDeliveryDate || order.deliveryDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="text-sm font-semibold mt-0.5 capitalize">{order.priority}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Currency</p>
                <p className="text-sm font-semibold mt-0.5">{order.currency}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-semibold mt-0.5">{formatCurrency(order.totalAmount, order.currency)}</p>
              </div>
              {order.paymentTerms?.name && (
                <div>
                  <p className="text-xs text-muted-foreground">Payment Terms</p>
                  <p className="text-sm font-semibold mt-0.5">{order.paymentTerms.name}</p>
                </div>
              )}
              {order.legalEntity?.legalName && (
                <div>
                  <p className="text-xs text-muted-foreground">Legal Entity</p>
                  <p className="text-sm font-semibold mt-0.5">{order.legalEntity.legalName}</p>
                </div>
              )}
            </div>
            {order.notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm mt-0.5">{order.notes}</p>
              </div>
            )}
          </div>

          {/* ── Items Table (always read-only) ── */}
          {(() => {
            const itemRows = order.lineItems.map((item) => {
              const fulfillmentSent = allNotices.reduce((sum, f) => {
                const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                return sum + (match?.quantityReady || match?.quantityShipped || 0);
              }, 0);
              const fulfillmentExceptions = allNotices.reduce((sum, f) => {
                const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                if (!match) return sum;
                const rej = match.finalQuantityRejected ?? match.quantityRejected ?? 0;
                const mis = match.finalQuantityMissing ?? match.quantityMissing ?? 0;
                return sum + rej + mis;
              }, 0);
              const unresolvedItemExceptions = allNotices.reduce((sum, f) => {
                const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                if (!match) return sum;
                return sum + getLineUnresolvedQty(match as any, f);
              }, 0);
              const disputedItemExceptions = allNotices.reduce((sum, f) => {
                const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                if (!match) return sum;
                return sum + getLineContestedDisputeQty(match as any, f);
              }, 0);
              const resolvedItemExceptions = allNotices.reduce((sum, f) => {
                const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                if (!match) return sum;
                if (isLineAlreadyResolved(match as any, f)) {
                  const r = match.finalQuantityRejected ?? match.quantityRejected ?? 0;
                  const m = match.finalQuantityMissing ?? match.quantityMissing ?? 0;
                  return sum + r + m;
                }
                const alloc = getLineAllocatedQty(match as any, f);
                return sum + alloc.total;
              }, 0);
              const matchingFulfillments = allNotices
                .map((f, idx) => ({
                  f,
                  idx,
                  li: f.lineItems.find(
                    (l) => l.purchaseOrderLineItemId === item.purchaseOrderLineItemId
                  ),
                }))
                .filter((entry): entry is { f: Fulfillment; idx: number; li: Fulfillment["lineItems"][number] } => !!entry.li);

              const unresolvedFulfillments = matchingFulfillments.filter(
                ({ f, li }) => getLineUnresolvedQty(li as any, f) > 0
              );
              const latestActiveFulfillment =
                unresolvedFulfillments[unresolvedFulfillments.length - 1] ||
                matchingFulfillments.filter(
                  ({ li }) => (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0
                ).slice(-1)[0];

              const latestExceptionDetail = latestActiveFulfillment ? (() => {
                const { f, idx, li } = latestActiveFulfillment;
                const rej = li.finalQuantityRejected ?? li.quantityRejected ?? 0;
                const mis = li.finalQuantityMissing ?? li.quantityMissing ?? 0;
                const rawReason = li.exceptionReason || li.rejectionReason || f.rejectionReason || "";
                const parsed = parseExceptionReason(rawReason);
                const isUnresolved = getLineUnresolvedQty(li as any, f) > 0;
                const isMultiShipment = allNotices.length > 1;
                const shipmentLabel = isMultiShipment ? `Shipment #${idx + 1}` : null;
                const rec = getLineRecommendedDisposition(li as any, f);
                return { rej, mis, category: parsed.category, text: parsed.text, isUnresolved, shipmentLabel, rec };
              })() : null;

              const latestBackorderInfo = (() => {
                for (let i = matchingFulfillments.length - 1; i >= 0; i--) {
                  const { f, li } = matchingFulfillments[i];
                  const allocs = li.dispositionAllocations || [];
                  const bo = allocs.find((a) => a.disposition === "backorder");
                  if (bo) {
                    return {
                      date: bo.expectedRedeliveryDate || li.expectedRedeliveryDate || f.expectedRedeliveryDate,
                      reason: bo.reason || f.resolutionNote,
                    };
                  }
                }
                return null;
              })();

              const effectiveBackorderDate =
                latestBackorderInfo?.date || item.expectedReadyDate;
              const effectiveBackorderReason =
                latestBackorderInfo?.reason || item.dispositionReason || item.reason || "";
              const qtyReady = fulfillmentSent > 0 ? fulfillmentSent : (item.quantityReady || 0);
              const isCancelled = item.remainingDisposition === "cannot_fulfill";
              const isFullyReady = qtyReady >= item.quantity;

              const qtyAccepted = item.quantityAccepted ?? item.quantityReceived ?? 0;
              const qtyAwaiting = Math.max(0, qtyReady - qtyAccepted - fulfillmentExceptions);
              const allocatedForfeit = matchingFulfillments.reduce((sum, { f, li }) => {
                const alloc = getLineAllocatedQty(li as any, f);
                return sum + alloc.forfeit;
              }, 0);
              const qtyForfeited = (item.quantityForfeited && item.quantityForfeited > 0)
                ? item.quantityForfeited
                : allocatedForfeit;
              const isShortClosed = (item.shortClosedQuantity || 0) > 0;

              const rejectionTooltip = latestExceptionDetail?.category
                ? (latestExceptionDetail.text ? `Buyer rejected: ${latestExceptionDetail.category} — ${latestExceptionDetail.text}` : `Buyer rejected: ${latestExceptionDetail.category}`)
                : `${fulfillmentExceptions} unit(s) rejected by buyer. Click row for details.`;

              const renderFulfillmentProgress = () => {
                const exceptionBadge = (() => {
                  if (unresolvedItemExceptions > 0) {
                    return (
                      <span
                        title={rejectionTooltip}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap cursor-pointer hover:bg-red-100 transition-colors"
                      >
                        <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                        {unresolvedItemExceptions} rejected
                      </span>
                    );
                  }
                  if (disputedItemExceptions > 0) {
                    return (
                      <span
                        title={rejectionTooltip}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap cursor-pointer hover:bg-purple-100 transition-colors"
                      >
                        {disputedItemExceptions} disputed
                      </span>
                    );
                  }
                  if (fulfillmentExceptions > 0) {
                    return (
                      <span
                        title={rejectionTooltip}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        {fulfillmentExceptions} rejected (resolved)
                      </span>
                    );
                  }
                  return null;
                })();

                if (qtyAccepted >= item.quantity) {
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-emerald-700">
                        {item.quantity} of {formatQtyWithUom(item.quantity, item.unitOfMeasure)} accepted
                      </span>
                      {exceptionBadge}
                    </div>
                  );
                }
                if (qtyAccepted > 0) {
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">
                          {qtyAccepted} of {formatQtyWithUom(item.quantity, item.unitOfMeasure)} accepted
                        </span>
                        {exceptionBadge}
                      </div>
                      {qtyAwaiting > 0 && (
                        <p className="text-[11px] text-blue-600 font-normal">
                          +{qtyAwaiting} in transit
                        </p>
                      )}
                    </div>
                  );
                }
                if (qtyReady > 0) {
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-blue-700">
                        {qtyReady} of {formatQtyWithUom(item.quantity, item.unitOfMeasure)} dispatched
                      </span>
                      {exceptionBadge}
                    </div>
                  );
                }
                return (
                  <span className="text-xs text-muted-foreground">
                    0 of {formatQtyWithUom(item.quantity, item.unitOfMeasure)} sent
                  </span>
                );
              };

              const renderStatusBadge = () => {
                if (unresolvedItemExceptions > 0) {
                  return (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                      <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                      Action Required ({unresolvedItemExceptions} rejected)
                    </span>
                  );
                }
                if (disputedItemExceptions > 0) {
                  return (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                      Under Review ({disputedItemExceptions} disputed)
                    </span>
                  );
                }

                const lifecycleBadges: React.ReactNode[] = [];

                if (item.remainingDisposition === "backordered") {
                  lifecycleBadges.push(
                    <span key="backordered" className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                      <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                      {formatQtyWithUom(getRemainingToReady(item), item.unitOfMeasure)} Backordered{effectiveBackorderDate ? ` · Est. ${formatDate(effectiveBackorderDate)}` : ""}
                    </span>
                  );
                } else if (isCancelled) {
                  lifecycleBadges.push(
                    <span key="cancelled" className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                      Cannot Fulfill
                    </span>
                  );
                }

                if (qtyForfeited > 0) {
                  lifecycleBadges.push(
                    <span key="forfeited" className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                      {formatQtyWithUom(qtyForfeited, item.unitOfMeasure)} Forfeited
                    </span>
                  );
                }

                if (isShortClosed) {
                  lifecycleBadges.push(
                    <span key="shortclosed" className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                      {formatQtyWithUom(item.shortClosedQuantity!, item.unitOfMeasure)} Short-Closed
                    </span>
                  );
                }

                if (lifecycleBadges.length > 0) {
                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {lifecycleBadges}
                    </div>
                  );
                }

                if (qtyAccepted >= item.quantity) {
                  return (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                      Delivered
                    </span>
                  );
                }
                if (qtyReady > 0 && qtyAccepted === 0) {
                  return (
                    <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                      In Transit
                    </span>
                  );
                }
                if (qtyAccepted > 0) {
                  return (
                    <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                      Partially Delivered
                    </span>
                  );
                }
                if (qtyForfeited > 0) {
                  return (
                    <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                      {formatQtyWithUom(qtyForfeited, item.unitOfMeasure)} Forfeited
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-50 text-slate-600 border border-slate-200 whitespace-nowrap">
                    Not Started
                  </span>
                );
              };

              return { item, isCancelled, renderFulfillmentProgress, renderStatusBadge };
            });

            return (
              <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    Items <span className="text-muted-foreground font-normal ml-1">{order.lineItems.length}</span>
                  </h2>
                  {!isEnteringDates && (
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      Click any item to view fulfillment details & history
                    </p>
                  )}
                </div>

                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-border/60">
                  {itemRows.map(({ item, isCancelled, renderFulfillmentProgress, renderStatusBadge }) => (
                    <div
                      key={item.purchaseOrderLineItemId}
                      onClick={() => !isEnteringDates && setSelectedItemForDrawer(item)}
                      className={cn(
                        "p-4 space-y-2.5 transition-colors",
                        !isEnteringDates && "cursor-pointer hover:bg-muted/30",
                        isCancelled ? "bg-red-50/30" : ""
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          {item.description?.trim() && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                        {!isEnteringDates && (
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground">
                              {formatCurrency(item.lineTotal, order.currency)}
                            </p>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {item.pricingSegments?.length ? (
                                <div className="space-y-1">
                                  {item.pricingSegments.map((segment, index) => (
                                    <div key={index} className="flex items-center justify-end gap-1">
                                      <span className="font-medium text-foreground">
                                        {Number(segment.to) - Number(segment.from)} × {formatCurrency(Number(segment.unitPrice), order.currency)}
                                      </span>
                                      <span className="px-1 py-0.2 rounded text-[10px] bg-muted text-muted-foreground border border-border">
                                        Rev {segment.revision}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <>{formatCurrency(item.unitPrice, order.currency)} / unit</>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="text-muted-foreground">
                          Qty: <strong className="text-foreground font-medium">{formatQtyWithUom(item.quantity, item.unitOfMeasure)}</strong>
                        </span>
                        {!isEnteringDates && renderStatusBadge()}
                      </div>

                      {isEnteringDates ? (
                        <div>
                          <label htmlFor={`mobile-date-${item.purchaseOrderLineItemId}`} className="block text-xs font-medium text-muted-foreground mb-1">
                            Promise date
                          </label>
                          <DatePicker
                            date={parseLocalDate(draftDates[item.purchaseOrderLineItemId])}
                            onSelect={(d) =>
                              setDraftDates((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: d ? format(d, "yyyy-MM-dd") : "" }))
                            }
                            disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                            className="h-9 px-2.5 w-full"
                          />
                        </div>
                      ) : (
                        <div className="pt-0.5">
                          {renderFulfillmentProgress()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop / tablet table view */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Item</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Quantity</th>
                        {isEnteringDates ? (
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Promise date</th>
                        ) : (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Fulfillment</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Unit Price</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Line Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {itemRows.map(({ item, isCancelled, renderFulfillmentProgress, renderStatusBadge }) => (
                        <tr
                          key={item.purchaseOrderLineItemId}
                          onClick={() => !isEnteringDates && setSelectedItemForDrawer(item)}
                          className={cn(
                            "border-b border-border/60 hover:bg-muted/30 transition-colors",
                            !isEnteringDates && "cursor-pointer",
                            isCancelled ? "bg-red-50/30" : ""
                          )}
                        >
                          <td className="px-6 py-3.5">
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            {item.description?.trim() && (
                              <p className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</p>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-sm whitespace-nowrap">
                            <span className="font-medium text-foreground">{item.quantity}</span>
                            {item.unitOfMeasure && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {formatQtyWithUom(item.quantity, item.unitOfMeasure).replace(/^\d+\s*/, "")}
                              </span>
                            )}
                          </td>
                          {isEnteringDates ? (
                            <td className="px-6 py-3.5">
                              <label htmlFor={`date-${item.purchaseOrderLineItemId}`} className="sr-only">
                                Promise date for {item.name}
                              </label>
                              <DatePicker
                                date={parseLocalDate(draftDates[item.purchaseOrderLineItemId])}
                                onSelect={(d) =>
                                  setDraftDates((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: d ? format(d, "yyyy-MM-dd") : "" }))
                                }
                                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                className="h-9 px-2.5 min-w-[140px]"
                              />
                            </td>
                          ) : (
                            <>
                              <td className="px-6 py-3.5 whitespace-nowrap text-sm">
                                {renderFulfillmentProgress()}
                              </td>
                              <td className="px-6 py-3.5 whitespace-nowrap">
                                {renderStatusBadge()}
                              </td>
                              <td className="px-6 py-3.5 text-sm whitespace-nowrap">
                                {item.pricingSegments?.length ? (
                                  <div className="space-y-1">
                                    {item.pricingSegments.map((segment, index) => (
                                      <div key={index} className="flex items-center gap-1.5 text-xs">
                                        <span className="font-medium text-foreground">
                                          {Number(segment.to) - Number(segment.from)} × {formatCurrency(Number(segment.unitPrice), order.currency)}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                          Rev {segment.revision}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  formatCurrency(item.unitPrice, order.currency)
                                )}
                              </td>
                              <td className="px-6 py-3.5 text-sm font-medium whitespace-nowrap">{formatCurrency(item.lineTotal, order.currency)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ── Receipt Confirmation (dispatched vs buyer-confirmed) ── */}
          <ReceiptConfirmationSection
            lineItems={order.lineItems}
            fulfillments={allNotices}
            onOpenResolution={handleOpenResolution}
            onOpenFinalDecision={handleOpenFinalDecision}
          />

          {/* ── Fulfillment History ── */}
          <FulfillmentHistorySection
            notices={allNotices}
            orderLineItems={order.lineItems}
            onDispatch={(fulfillmentId) => {
              dispatchFulfillmentMutation.mutate({
                purchaseOrderId: order.purchaseOrderId,
                fulfillmentId,
                payload: {
                  dispatchReference: `DSP-${crypto.randomUUID().slice(0, 8)}`,
                  dispatchedAt: new Date().toISOString(),
                },
              });
            }}
            isDispatching={(fulfillmentId) =>
              dispatchFulfillmentMutation.isPending &&
              dispatchFulfillmentMutation.variables?.fulfillmentId === fulfillmentId
            }
            localResolutions={localResolutions}
            onOpenResolution={handleOpenResolution}
            onOpenFinalDecision={handleOpenFinalDecision}
          />
        </div>

        {/* ── Workflow Progress Sidebar ── */}
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 h-fit">
          <h3 className="text-sm font-semibold mb-4">Workflow Progress</h3>
          {order.status === "cancelled" ? (
            <p className="text-sm text-muted-foreground">This order was withdrawn.</p>
          ) : (
            <div className="space-y-0">
              {(() => {
                const timelineByAction = (order.timeline || []).reduce((acc: Record<string, TimelineEvent>, event: TimelineEvent) => {
                  acc[event.action] = event;
                  return acc;
                }, {});

                const isDelivered = [
                  "partially_delivered",
                  "partially_delivered_with_exceptions",
                  "delivered",
                  "delivered_with_exceptions",
                ].includes(order.status);
                const fulfillmentCount = order.fulfillments?.length || order.deliveryNotices?.length || 0;

                const anyDispatched = allNotices.some(
                  (f) =>
                    f.dispatchStatus === "dispatched" ||
                    ["digital", "service"].includes(f.fulfillmentMethod || "")
                );
                const latestDispatchedAt = [...allNotices]
                  .reverse()
                  .find((f) => f.dispatchedAt)?.dispatchedAt;

                const steps = [
                  {
                    id: "issued",
                    label: "Assigned",
                    timestamp: timelineByAction["assigned_to_vendor"]?.timestamp || timelineByAction["issued"]?.timestamp || order.issuedAt,
                    done: !!timelineByAction["assigned_to_vendor"] || !!timelineByAction["issued"] || !!order.issuedAt,
                  },
                  {
                    id: "acknowledged",
                    label: "Acknowledged",
                    timestamp: timelineByAction["acknowledged"]?.timestamp || order.acknowledgedAt,
                    done: !!timelineByAction["acknowledged"] || !!order.acknowledgedAt,
                  },
                  {
                    id: "ready_for_delivery",
                    label: "Fulfillment Declared",
                    timestamp: timelineByAction["ready_for_delivery"]?.timestamp || order.readyForDeliveryAt,
                    done: !!timelineByAction["ready_for_delivery"] || !!order.readyForDeliveryAt || fulfillmentCount > 0,
                    subtitle: fulfillmentCount > 0 ? `${fulfillmentCount} shipment${fulfillmentCount > 1 ? "s" : ""} created` : undefined,
                  },
                  {
                    id: "dispatched",
                    label: "Dispatched",
                    timestamp: latestDispatchedAt || timelineByAction["dispatched"]?.timestamp,
                    done: anyDispatched || isDelivered,
                    subtitle:
                      awaitingDispatchNotices.length > 0
                        ? `Shipment #${awaitingDispatchNotices[0].index + 1} awaiting dispatch`
                        : awaitingReceiptNotices.length > 0
                        ? `Shipment #${awaitingReceiptNotices[0].index + 1} awaiting buyer confirmation`
                        : undefined,
                  },
                  {
                    id: "delivered",
                    label:
                      order.status === "delivered" || order.status === "delivered_with_exceptions"
                        ? "Receipt Confirmed"
                        : poQuantities.confirmedReceived > 0
                        ? `Partially Confirmed (${poQuantities.confirmedReceived}/${poQuantities.ordered})`
                        : "Receipt Confirmed",
                    timestamp: timelineByAction["delivered"]?.timestamp || timelineByAction["partially_delivered"]?.timestamp || order.deliveredAt,
                    done: !!timelineByAction["delivered"] || !!timelineByAction["partially_delivered"] || isDelivered || poQuantities.confirmedReceived > 0,
                  },
                  {
                    id: "closed",
                    label: "Invoiced",
                    timestamp: timelineByAction["closed"]?.timestamp || order.closedAt,
                    done: !!timelineByAction["closed"] || !!order.closedAt || invoices.length > 0,
                  }
                ];

                return steps.map((step, idx) => {
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                            step.done ? "border-primary bg-primary" : "border-border bg-white"
                          )}
                        >
                          {step.done && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                        {!isLast && (
                          <div className={cn("w-0.5 flex-1 my-1", step.done ? "bg-primary" : "bg-border")} style={{ minHeight: 24 }} />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className={cn("text-sm font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>
                          {step.label}
                        </p>
                        {step.timestamp && (
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(step.timestamp)}</p>
                        )}
                        {"subtitle" in step && step.subtitle && (
                          <p className="text-xs text-blue-600 mt-0.5">{step.subtitle}</p>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Price Modifications & Revisions History (Shown only when revisions or proposals exist) ── */}
      <PriceChangeHistorySection
        order={order}
        onOpenProposal={(reqId) =>
          setPriceProposalModalState({
            open: true,
            mode: "view",
            requestId: reqId,
          })
        }
      />

      <FulfillmentModal
        open={fulfillmentModalOpen}
        onClose={() => setFulfillmentModalOpen(false)}
        onSubmit={handleFulfillmentSubmit}
        lineItems={order.lineItems}
        isSubmitting={createFulfillment.isPending || dispatchFulfillmentMutation.isPending}
        initialDeclaration={modalDeclaration}
        existingReferences={allNotices.flatMap(
          (f) => [f.fulfillmentReference, f.shipmentReference].filter((r): r is string => !!r)
        )}
        nextShipmentNumber={allNotices.length + 1}
      />
      {/* ── Item Fulfillment Drawer ── */}
      <ItemFulfillmentDrawer
        open={!!selectedItemForDrawer}
        onClose={() => setSelectedItemForDrawer(null)}
        item={selectedItemForDrawer}
        fulfillments={allNotices}
        currency={order.currency}
        onOpenResolution={handleOpenResolution}
        onOpenFinalDecision={handleOpenFinalDecision}
      />

      {/* ── Unified Spacious Resolution Modal (Supports Mixed Dispute + Acknowledge & Custom UI) ── */}
      <ResolutionModal
        open={resolutionModalState.open}
        onClose={() => setResolutionModalState((prev) => ({ ...prev, open: false }))}
        onSubmit={handleUnifiedResolutionSubmit}
        fulfillment={resolutionModalState.fulfillment}
        fulfillmentIndex={resolutionModalState.fulfillmentIndex}
        targetLineItemId={resolutionModalState.targetLineItemId}
        initialAction={resolutionModalState.initialAction}
        isSubmitting={resolveReceiptException.isPending}
      />

      {/* ── Accept Final Decision Modal (Backorder / Forfeit only — no dispute) ── */}
      <ResolutionModal
        open={finalDecisionModalState.open}
        onClose={() => setFinalDecisionModalState((prev) => ({ ...prev, open: false }))}
        onSubmit={handleFinalDecisionSubmit}
        fulfillment={finalDecisionModalState.fulfillment}
        fulfillmentIndex={finalDecisionModalState.fulfillmentIndex}
        initialAction="backorder"
        isSubmitting={acceptFinalDecisionMutation.isPending}
        mode="accept-final-decision"
      />

      {/* ── Price Proposal Drawer ── */}
      <PriceProposalDrawer
        open={priceProposalModalState.open}
        onClose={() => setPriceProposalModalState((prev) => ({ ...prev, open: false }))}
        order={order}
        initialRequestId={priceProposalModalState.requestId}
        initialMode={priceProposalModalState.mode}
      />
    </div>
  );
}
