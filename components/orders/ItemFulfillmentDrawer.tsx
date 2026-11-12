"use client";

import React from "react";
import {
  Package,
  Truck,
  Monitor,
  Wrench,
  X,
  History,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  FileText,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EvidenceGallery } from "@/components/orders/EvidenceGallery";
import { ExpandableText } from "@/components/ui/ExpandableText";
import {
  formatDateTime,
  formatDate,
  formatCurrency,
  formatQtyWithUom,
  parseExceptionReason,
  cn,
} from "@/lib/utils";
import type { OrderLineItem, Fulfillment } from "@/lib/types";
import {
  getLineUnresolvedQty,
  getLineAllocatedQty,
  getLineContestedDisputeQty,
  isLineAlreadyResolved,
  getLineRecommendedDisposition,
} from "@/components/orders/ResolutionModal";

interface ItemFulfillmentDrawerProps {
  open: boolean;
  onClose: () => void;
  item: OrderLineItem | null;
  fulfillments: Fulfillment[];
  currency?: string;
  onOpenResolution?: (
    fulfillment: Fulfillment,
    fulfillmentIndex: number,
    targetLineItemId: string | null,
    initialAction: "backorder" | "dispute"
  ) => void;
  onOpenFinalDecision?: (fulfillment: Fulfillment, index: number) => void;
}

function formatFinalDecisionLabel(decision?: string | null): string {
  switch (decision) {
    case "uphold_buyer_finding":
      return "Buyer Finding Upheld";
    case "accept_vendor_dispute":
      return "Vendor Dispute Accepted";
    case "revise_buyer_finding":
      return "Buyer Finding Revised";
    default:
      return "Resolved";
  }
}

export function ItemFulfillmentDrawer({
  open,
  onClose,
  item,
  fulfillments,
  currency = "NGN",
  onOpenResolution,
  onOpenFinalDecision,
}: ItemFulfillmentDrawerProps) {
  if (!item) return null;

  const uom = item.unitOfMeasure || "unit";

  // Filter fulfillments that include this item
  const relevantFulfillments = fulfillments
    .map((f, index) => {
      const lineItem = f.lineItems.find(
        (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
      );
      return { notice: f, lineItem, index };
    })
    .filter(
      (
        f
      ): f is {
        notice: Fulfillment;
        lineItem: Fulfillment["lineItems"][number];
        index: number;
      } => !!f.lineItem
    )
    // Sort chronologically by readyAt or shippedAt
    .sort((a, b) => {
      const dateA = new Date(
        a.notice.dispatchedAt || a.notice.readyAt || a.notice.shippedAt || a.notice.createdAt || 0
      ).getTime();
      const dateB = new Date(
        b.notice.dispatchedAt || b.notice.readyAt || b.notice.shippedAt || b.notice.createdAt || 0
      ).getTime();
      return dateA - dateB;
    });

  // Calculate comprehensive metrics across all fulfillments
  const totalDispatched = relevantFulfillments.reduce(
    (sum, f) => sum + (f.lineItem.quantityReady || f.lineItem.quantityShipped || 0),
    0
  );

  const totalAccepted = relevantFulfillments.reduce(
    (sum, f) =>
      sum +
      (f.lineItem.finalQuantityAccepted ??
        f.lineItem.quantityAccepted ??
        f.lineItem.quantityReceived ??
        0),
    0
  );

  const totalRejected = relevantFulfillments.reduce(
    (sum, f) =>
      sum + (f.lineItem.finalQuantityRejected ?? f.lineItem.quantityRejected ?? 0),
    0
  );

  const totalMissing = relevantFulfillments.reduce(
    (sum, f) =>
      sum + (f.lineItem.finalQuantityMissing ?? f.lineItem.quantityMissing ?? 0),
    0
  );

  const totalExceptions = totalRejected + totalMissing;
  const remainingToDispatch = Math.max(0, item.quantity - totalDispatched);
  const totalAwaitingInspection = Math.max(
    0,
    totalDispatched - totalAccepted - totalExceptions
  );

  const unresolvedExceptions = relevantFulfillments.reduce(
    (sum, f) => sum + getLineUnresolvedQty(f.lineItem as any, f.notice),
    0
  );

  const allocatedExceptions = relevantFulfillments.reduce(
    (acc, f) => {
      const q = getLineAllocatedQty(f.lineItem as any, f.notice);
      return {
        backorder: acc.backorder + q.backorder,
        forfeit: acc.forfeit + q.forfeit,
        total: acc.total + q.total,
      };
    },
    { backorder: 0, forfeit: 0, total: 0 }
  );

  const contestedExceptions = relevantFulfillments.reduce(
    (sum, f) => sum + getLineContestedDisputeQty(f.lineItem as any, f.notice),
    0
  );

  const hasPendingFinalDecision = relevantFulfillments.some(
    (f) =>
      f.notice.finalDecision != null &&
      (f.notice.resolutionStatus === "awaiting_vendor_disposition" ||
        f.lineItem.resolutionStatus === "awaiting_vendor_disposition" ||
        f.notice.vendorActionRequired === true) &&
      !isLineAlreadyResolved(f.lineItem as any, f.notice)
  );

  const hasActiveDispute = relevantFulfillments.some(
    (f) =>
      (f.notice.resolutionStatus === "under_company_review" ||
        f.lineItem.vendorDisposition === "dispute") &&
      !f.notice.finalDecision &&
      !isLineAlreadyResolved(f.lineItem as any, f.notice)
  );

  const allExceptionsResolved =
    totalExceptions > 0 && unresolvedExceptions === 0;

  const isCancelled = item.remainingDisposition === "cannot_fulfill";
  const isBackordered = item.remainingDisposition === "backordered";
  const isFullyAccepted = totalAccepted >= item.quantity;

  const quantityBackordered =
    item.remainingDisposition === "backordered"
      ? (item.quantityRemainingToReady ??
         item.quantityOutstanding ??
         Math.max(0, item.quantity - totalDispatched - (item.quantityForfeited || 0)))
      : allocatedExceptions.backorder;

  const quantityForfeited =
    item.quantityForfeited ?? allocatedExceptions.forfeit ?? 0;

  const methodLabel: Record<string, string> = {
    carrier: "Carrier",
    vendor_truck: "Vendor Truck",
    digital: "Digital Delivery",
    service: "Service Delivery",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        showClose={false}
        className="p-0 overflow-hidden max-h-[90vh] flex flex-col gap-0 max-w-2xl sm:max-w-3xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-dashboard-bg/60">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-lg font-bold text-foreground">
                {item.name}
              </DialogTitle>
              {item.unitPrice != null && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                  {formatCurrency(item.unitPrice, currency)} / {uom}
                </span>
              )}
              {item.lineTotal != null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Total: {formatCurrency(item.lineTotal, currency)}
                </span>
              )}
            </div>
            {item.description?.trim() && (
              <p className="text-xs text-muted-foreground mt-1 truncate max-w-lg">
                {item.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* ── 1. Comprehensive Lifecycle Summary Cards ── */}
          <div>
            <div
              className={cn(
                "grid gap-3",
                quantityForfeited > 0
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                  : "grid-cols-2 sm:grid-cols-5"
              )}
            >
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Ordered</p>
                <p className="text-base font-bold text-foreground">
                  {formatQtyWithUom(item.quantity, uom)}
                </p>
                <p className="text-[10px] text-muted-foreground">Total order quantity</p>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70 space-y-1">
                <p className="text-[11px] font-medium text-blue-700">Dispatched</p>
                <p className="text-base font-bold text-blue-900">
                  {formatQtyWithUom(totalDispatched, uom)}
                </p>
                <p className="text-[10px] text-blue-700">
                  {relevantFulfillments.length} shipment{relevantFulfillments.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/70 space-y-1">
                <p className="text-[11px] font-medium text-emerald-700">Buyer Accepted</p>
                <p className="text-base font-bold text-emerald-900">
                  {formatQtyWithUom(totalAccepted, uom)}
                </p>
                <p className="text-[10px] text-emerald-700">
                  {totalAccepted > 0
                    ? `${Math.round((totalAccepted / (item.quantity || 1)) * 100)}% of total`
                    : "None accepted yet"}
                </p>
              </div>

              <div
                className={cn(
                  "p-3.5 rounded-xl space-y-1 border",
                  totalExceptions > 0
                    ? "bg-red-50/70 border-red-200 text-red-900"
                    : "bg-muted/40 border-border/70 text-foreground"
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    totalExceptions > 0 ? "text-red-700" : "text-muted-foreground"
                  )}
                >
                  Exceptions
                </p>
                <p
                  className={cn(
                    "text-base font-bold",
                    totalExceptions > 0 ? "text-red-900" : "text-foreground"
                  )}
                >
                  {formatQtyWithUom(totalExceptions, uom)}
                </p>
                <p
                  className={cn(
                    "text-[10px] truncate",
                    hasPendingFinalDecision
                      ? "text-amber-700 font-semibold"
                      : hasActiveDispute
                      ? "text-purple-700 font-semibold"
                      : allExceptionsResolved
                      ? "text-emerald-700 font-medium"
                      : totalExceptions > 0
                      ? "text-red-700 font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {hasPendingFinalDecision
                    ? `Ruling: Upheld (${unresolvedExceptions} to allocate)`
                    : hasActiveDispute
                    ? `Disputed (${contestedExceptions} under review)`
                    : allExceptionsResolved
                    ? `✓ Resolved (${allocatedExceptions.backorder > 0 ? `${allocatedExceptions.backorder} Backorder` : ""}${allocatedExceptions.backorder > 0 && allocatedExceptions.forfeit > 0 ? ", " : ""}${allocatedExceptions.forfeit > 0 ? `${allocatedExceptions.forfeit} Forfeit` : ""})`
                    : totalExceptions > 0
                    ? [
                        totalRejected > 0 ? `${totalRejected} rejected` : null,
                        totalMissing > 0 ? `${totalMissing} missing` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "No exceptions"}
                </p>
              </div>

              <div
                className={cn(
                  "p-3.5 rounded-xl space-y-1 border",
                  quantityBackordered > 0
                    ? "bg-amber-50/70 border-amber-200 text-amber-900"
                    : isCancelled
                    ? "bg-red-50/70 border-red-200 text-red-900"
                    : "bg-muted/40 border-border/70 text-foreground"
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    quantityBackordered > 0
                      ? "text-amber-800"
                      : isCancelled
                      ? "text-red-700"
                      : "text-muted-foreground"
                  )}
                >
                  {quantityBackordered > 0
                    ? "Backordered"
                    : isCancelled
                    ? "Cannot Fulfill"
                    : "Remaining to Ship"}
                </p>
                <p className="text-base font-bold">
                  {formatQtyWithUom(
                    quantityBackordered > 0
                      ? quantityBackordered
                      : isCancelled
                      ? item.quantity - totalDispatched
                      : remainingToDispatch,
                    uom
                  )}
                </p>
                <p
                  className={cn(
                    "text-[10px]",
                    quantityBackordered > 0
                      ? "text-amber-800 font-medium"
                      : isCancelled
                      ? "text-red-700 font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {quantityBackordered > 0
                    ? item.expectedReadyDate
                      ? `Est. ${formatDate(item.expectedReadyDate)}`
                      : "Awaiting restock"
                    : isCancelled
                    ? "Short-closed"
                    : remainingToDispatch === 0
                    ? "Fully dispatched"
                    : "Unfulfilled"}
                </p>
              </div>

              {quantityForfeited > 0 && (
                <div className="p-3.5 rounded-xl space-y-1 border bg-rose-50/70 border-rose-200 text-rose-900">
                  <p className="text-[11px] font-medium text-rose-700">Forfeited</p>
                  <p className="text-base font-bold text-rose-950">
                    {formatQtyWithUom(quantityForfeited, uom)}
                  </p>
                  <p className="text-[10px] text-rose-700 font-medium">Written off</p>
                </div>
              )}
            </div>

            {/* Visual Quantity Breakdown Bar */}
            <div className="mt-3 p-3 rounded-xl bg-muted/20 border border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Unit Distribution</span>
                <span>
                  {totalAccepted} of {item.quantity} {uom} accepted (
                  {Math.round((totalAccepted / (item.quantity || 1)) * 100)}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                {totalAccepted > 0 && (
                  <div
                    style={{ width: `${(totalAccepted / item.quantity) * 100}%` }}
                    className="bg-emerald-500 h-full transition-all"
                    title={`${totalAccepted} accepted`}
                  />
                )}
                {totalAwaitingInspection > 0 && (
                  <div
                    style={{
                      width: `${(totalAwaitingInspection / item.quantity) * 100}%`,
                    }}
                    className="bg-blue-400 h-full transition-all"
                    title={`${totalAwaitingInspection} awaiting inspection`}
                  />
                )}
                {unresolvedExceptions > 0 && (
                  <div
                    style={{ width: `${(unresolvedExceptions / item.quantity) * 100}%` }}
                    className="bg-red-500 h-full transition-all"
                    title={`${unresolvedExceptions} unresolved exceptions`}
                  />
                )}
                {quantityBackordered > 0 && (
                  <div
                    style={{
                      width: `${(quantityBackordered / item.quantity) * 100}%`,
                    }}
                    className="bg-amber-400 h-full transition-all"
                    title={`${quantityBackordered} backordered`}
                  />
                )}
                {quantityForfeited > 0 && (
                  <div
                    style={{
                      width: `${(quantityForfeited / item.quantity) * 100}%`,
                    }}
                    className="bg-rose-500 h-full transition-all"
                    title={`${quantityForfeited} forfeited`}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>Accepted ({totalAccepted})</span>
                </div>
                {totalAwaitingInspection > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                    <span>Awaiting Inspection ({totalAwaitingInspection})</span>
                  </div>
                )}
                {totalExceptions > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                    <span>Exceptions ({totalExceptions})</span>
                  </div>
                )}
                {quantityBackordered > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                    <span>Backordered ({quantityBackordered})</span>
                  </div>
                )}
                {quantityForfeited > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                    <span>Forfeited ({quantityForfeited})</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. Remaining Order Disposition Banner (if balance remaining) ── */}
          {quantityBackordered > 0 && isBackordered && (
            <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 flex items-start gap-3 text-xs">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-amber-950">
                    {quantityBackordered} {uom} Backordered for Later Shipment
                  </span>
                  {item.expectedReadyDate && (
                    <span className="text-[11px] font-medium bg-amber-100/90 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">
                      Estimated Ready: {formatDate(item.expectedReadyDate)}
                    </span>
                  )}
                </div>
                {(item.dispositionReason || item.reason) && (
                  <p className="text-amber-900 leading-relaxed">
                    <span className="font-semibold text-amber-950">Backorder Reason: </span>
                    {item.dispositionReason || item.reason}
                  </p>
                )}
              </div>
            </div>
          )}

          {quantityForfeited > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50/90 border border-rose-200 flex items-start gap-3 text-xs">
              <div className="p-2 rounded-lg bg-rose-100 text-rose-800 shrink-0">
                <XCircle className="h-4 w-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-rose-950">
                    {quantityForfeited} {uom} Forfeited
                  </span>
                  <span className="text-[11px] font-medium bg-rose-100/90 text-rose-900 px-2 py-0.5 rounded-md border border-rose-200">
                    Written off (no replacement)
                  </span>
                </div>
                <p className="text-rose-900 leading-relaxed">
                  These units were rejected during receipt inspection and agreed to be written off.
                </p>
              </div>
            </div>
          )}

          {remainingToDispatch > 0 && isCancelled && (
            <div className="p-3.5 rounded-xl bg-red-50/90 border border-red-200 flex items-start gap-3 text-xs">
              <div className="p-2 rounded-lg bg-red-100 text-red-800 shrink-0">
                <XCircle className="h-4 w-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <span className="font-bold text-red-950">
                  {remainingToDispatch} {uom} Cannot Be Supplied (Cancelled / Short-Closed)
                </span>
                {(item.dispositionReason || item.reason) && (
                  <p className="text-red-900 leading-relaxed">
                    <span className="font-semibold text-red-950">Cancellation Reason: </span>
                    {item.dispositionReason || item.reason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── 3. Fulfillment & Inspection Timeline ── */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Fulfillment & Inspection History
                <span className="text-xs font-normal text-muted-foreground">
                  ({relevantFulfillments.length} event{relevantFulfillments.length === 1 ? "" : "s"})
                </span>
              </h3>
            </div>

            {relevantFulfillments.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-muted/20 border border-dashed border-border">
                <Package className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No fulfillment records yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This item has not been included in any declared delivery notice or shipment.
                </p>
              </div>
            ) : (
              <div className="space-y-5 relative before:absolute before:inset-0 before:ml-[1.25rem] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {relevantFulfillments.map(({ notice, lineItem: li, index: fIdx }) => {
                  const method = notice.fulfillmentMethod || "unknown";
                  const isPhysical = ["carrier", "vendor_truck"].includes(method);
                  let Icon = Package;
                  if (isPhysical) Icon = Truck;
                  else if (method === "digital") Icon = Monitor;
                  else if (method === "service") Icon = Wrench;

                  const liDispatched = li.quantityReady || li.quantityShipped || 0;
                  const liAccepted =
                    li.finalQuantityAccepted ??
                    li.quantityAccepted ??
                    li.quantityReceived ??
                    0;
                  const liRejected =
                    li.finalQuantityRejected ?? li.quantityRejected ?? 0;
                  const liMissing =
                    li.finalQuantityMissing ?? li.quantityMissing ?? 0;
                  const liExceptions = liRejected + liMissing;

                  const parsedReason = parseExceptionReason(
                    li.exceptionReason || li.rejectionReason || notice.rejectionReason || ""
                  );

                  const unresolvedQty = getLineUnresolvedQty(li as any, notice);

                  const isFinalDecisionPending =
                    notice.finalDecision != null &&
                    (notice.resolutionStatus === "awaiting_vendor_disposition" ||
                      li.resolutionStatus === "awaiting_vendor_disposition" ||
                      notice.vendorActionRequired === true) &&
                    unresolvedQty > 0;

                  const isFinalResolved =
                    !isFinalDecisionPending &&
                    (notice.resolutionStatus === "resolved_after_dispute" ||
                      li.resolutionStatus === "resolved_after_dispute" ||
                      (notice.finalDecision != null && unresolvedQty === 0));

                  const isVendorActionReq =
                    !isFinalDecisionPending &&
                    !isFinalResolved &&
                    (unresolvedQty > 0 ||
                      (liExceptions > 0 &&
                        !li.vendorDisposition &&
                        (notice.resolutionStatus === "awaiting_vendor_response" ||
                          notice.vendorActionRequired === true)));

                  const isDisputedUnderReview =
                    notice.resolutionStatus === "under_company_review" ||
                    li.resolutionStatus === "under_company_review" ||
                    li.vendorDisposition === "dispute";

                  return (
                    <div
                      key={notice.vendorDeliveryNoticeId}
                      className="relative flex items-start gap-4 group"
                    >
                      {/* Timeline icon node */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-dashboard-bg text-muted-foreground shrink-0 shadow-xs z-10">
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Timeline Card */}
                      <div className="flex-1 min-w-0 p-4 rounded-xl border border-dashboard-border bg-white shadow-xs space-y-3.5">
                        {/* Header: Title, References, Status Pills */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/60">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-foreground">
                                Shipment #{fIdx + 1}
                              </span>
                              {notice.receiptNumber && (
                                <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded-md border border-border text-foreground">
                                  {notice.receiptNumber}
                                </span>
                              )}
                              {/* Shipment Dispatch Pill */}
                              {isPhysical && (
                                <span
                                  className={cn(
                                    "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                                    notice.dispatchStatus === "dispatched"
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                  )}
                                >
                                  {notice.dispatchStatus === "dispatched"
                                    ? "Dispatched"
                                    : "Awaiting Dispatch"}
                                </span>
                              )}
                              {/* Inspection State Pill */}
                              {isFinalDecisionPending ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  Final Decision · Allocation Required ({unresolvedQty})
                                </span>
                              ) : isVendorActionReq ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-800 border border-red-200">
                                  Action Required · {unresolvedQty > 0 ? `${unresolvedQty} Pending Resolution` : `${liExceptions} Exception${liExceptions > 1 ? "s" : ""}`}
                                </span>
                              ) : isDisputedUnderReview ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                  Disputed · Under Review
                                </span>
                              ) : isFinalResolved ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Final Decision: {formatFinalDecisionLabel(notice.finalDecision)}
                                </span>
                              ) : liAccepted > 0 && liExceptions === 0 ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                                  All Accepted
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDateTime(
                                notice.dispatchedAt ||
                                  notice.readyAt ||
                                  notice.shippedAt ||
                                  notice.createdAt
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Logistics Meta Information */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="font-medium text-foreground">
                            Via {methodLabel[method] || method}
                          </span>
                          {notice.carrier && (
                            <span className="border-l border-border pl-3">
                              Carrier: <strong className="text-foreground">{notice.carrier}</strong>
                            </span>
                          )}
                          {notice.trackingNumber && (
                            <span className="border-l border-border pl-3 font-mono">
                              Tracking: <strong className="text-foreground">{notice.trackingNumber}</strong>
                            </span>
                          )}
                          {notice.licensePlate && (
                            <span className="border-l border-border pl-3">
                              Plate: <strong className="text-foreground">{notice.licensePlate}</strong>
                            </span>
                          )}
                          {notice.driverName && (
                            <span className="border-l border-border pl-3">
                              Driver: <strong className="text-foreground">{notice.driverName}</strong>
                              {notice.driverPhone ? ` (${notice.driverPhone})` : ""}
                            </span>
                          )}
                        </div>

                        {/* Shipment Quantities Row */}
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground text-[11px]">Sent in Shipment</p>
                              <p className="text-sm font-bold text-foreground mt-0.5">
                                {formatQtyWithUom(liDispatched, uom)}
                              </p>
                            </div>
                            <div>
                              <p className="text-emerald-700 text-[11px] font-medium">Buyer Accepted</p>
                              <p className="text-sm font-bold text-emerald-800 mt-0.5">
                                {formatQtyWithUom(liAccepted, uom)}
                              </p>
                            </div>
                            <div>
                              <p className="text-red-700 text-[11px] font-medium">Rejected</p>
                              <p className="text-sm font-bold text-red-800 mt-0.5">
                                {formatQtyWithUom(liRejected, uom)}
                              </p>
                            </div>
                            <div>
                              <p className="text-amber-800 text-[11px] font-medium">Missing</p>
                              <p className="text-sm font-bold text-amber-900 mt-0.5">
                                {formatQtyWithUom(liMissing, uom)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* ── Buyer Inspection Findings & Evidence (if exceptions reported) ── */}
                        {liExceptions > 0 && (
                          <div className="p-3.5 rounded-xl bg-red-50/90 border border-red-200 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 font-bold text-red-950">
                                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                                <span>Buyer Inspection Discrepancy</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {liRejected > 0 && (
                                  <span className="text-[10px] font-bold bg-red-200 text-red-900 px-1.5 py-0.5 rounded">
                                    {liRejected} rejected
                                  </span>
                                )}
                                {liMissing > 0 && (
                                  <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                                    {liMissing} missing
                                  </span>
                                )}
                                {parsedReason.categories?.map((cat, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] font-semibold bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 rounded"
                                  >
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Detailed Buyer Note with expandable text */}
                            {parsedReason.text ? (
                              <div className="bg-white/70 border border-red-200/70 p-2.5 rounded-lg">
                                <ExpandableText
                                  prefix="Buyer Note:"
                                  prefixClass="text-red-950 font-bold"
                                  text={parsedReason.text}
                                  maxLength={100}
                                  className="text-red-900"
                                />
                              </div>
                            ) : (
                              <p className="text-red-800/80 italic">
                                No specific inspection note provided by buyer.
                              </p>
                            )}

                            {/* Buyer Recommendation */}
                            {(() => {
                              const rec = getLineRecommendedDisposition(li, notice);
                              if (!rec) return null;
                              return (
                                <div className="flex items-center gap-1.5 text-xs text-sky-900 bg-sky-50 border border-sky-200 p-2.5 rounded-lg font-medium flex-wrap">
                                  <span className="font-bold">Buyer Recommendation:</span>
                                  <span className="capitalize font-semibold text-sky-950">
                                    {rec === "forfeit" ? "Forfeit (write off)" : "Backorder (send replacement)"}
                                  </span>
                                  <span className="text-[11px] text-sky-700/80">
                                    — Non-binding recommendation
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Photo Evidence Gallery */}
                            {notice.evidence && notice.evidence.length > 0 && (
                              <div className="pt-1">
                                <p className="text-[11px] font-semibold text-red-950 mb-1.5">
                                  Inspection Evidence Photos ({notice.evidence.length})
                                </p>
                                <EvidenceGallery
                                  buyerEvidence={notice.evidence}
                                  compact
                                  variant="thumbnails"
                                />
                              </div>
                            )}

                            {/* Resolution Status / Action Required Trigger */}
                            <div className="pt-2 border-t border-red-200/70 flex items-center justify-between gap-3 flex-wrap">
                              {isFinalDecisionPending ? (
                                <>
                                  <div>
                                    <p className="text-amber-950 font-bold text-xs">
                                      Buyer Ruling: {formatFinalDecisionLabel(notice.finalDecision)} ({unresolvedQty} to allocate)
                                    </p>
                                    <p className="text-amber-800 text-[11px]">
                                      Choose to backorder or forfeit to complete the resolution.
                                    </p>
                                  </div>
                                  {onOpenFinalDecision && (
                                    <Button
                                      type="button"
                                      variant="primary"
                                      size="sm"
                                      onClick={() => {
                                        onClose();
                                        onOpenFinalDecision(notice, fIdx);
                                      }}
                                      className="h-8 px-3.5 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                                    >
                                      Allocate Remaining ({unresolvedQty})
                                    </Button>
                                  )}
                                </>
                              ) : isVendorActionReq ? (
                                <>
                                  <p className="text-red-800 font-medium">
                                    Response required: Choose to backorder, forfeit, or dispute.
                                  </p>
                                  {onOpenResolution && (
                                    <Button
                                      type="button"
                                      variant="primary"
                                      size="sm"
                                      onClick={() => {
                                        onClose();
                                        onOpenResolution(
                                          notice,
                                          fIdx,
                                          item.purchaseOrderLineItemId,
                                          "backorder"
                                        );
                                      }}
                                      className="h-8 px-3.5 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                                    >
                                      Review & Resolve
                                    </Button>
                                  )}
                                </>
                              ) : isDisputedUnderReview ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 font-bold text-purple-800">
                                    <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                                    <span>Dispute Submitted · Under Company Review</span>
                                  </div>
                                  {(li.vendorDispositionReason || notice.vendorResponseReason) && (
                                    <p className="text-purple-900">
                                      <span className="font-semibold">Your Dispute Note: </span>
                                      {li.vendorDispositionReason || notice.vendorResponseReason}
                                    </p>
                                  )}
                                </div>
                              ) : isFinalResolved ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>
                                      Final Company Decision:{" "}
                                      {formatFinalDecisionLabel(notice.finalDecision)}
                                    </span>
                                  </div>
                                  {notice.resolvedAt && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Resolved on {formatDateTime(notice.resolvedAt)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-[11px]">
                                  Resolution status: {notice.resolutionStatus || "Acknowledged"}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Shipment-level note if provided */}
                        {(notice.notes || (notice as any).dispatchNotes) && (
                          <div className="text-[11px] text-muted-foreground bg-muted/20 border border-border/50 rounded-lg p-2 flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <span>
                              <strong className="text-foreground">Shipment Note: </strong>
                              {notice.notes || (notice as any).dispatchNotes}
                            </span>
                          </div>
                        )}

                        {/* Vendor line item note only if distinct from the PO-level backorder reason */}
                        {li.reason &&
                          li.reason !== item.dispositionReason &&
                          li.reason !== item.reason &&
                          li.reason.trim().toLowerCase() !== "awaiting restock" && (
                            <div className="text-[11px] text-muted-foreground bg-muted/20 border border-border/50 rounded-lg p-2 flex items-start gap-1.5">
                              <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <span>
                                <strong className="text-foreground">Line Note: </strong>
                                {li.reason}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
