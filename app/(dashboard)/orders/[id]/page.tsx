"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, FilePlus2, Package, Truck, Send, Monitor, Wrench, AlertCircle, Clock, XCircle, ShieldAlert, FileText, ExternalLink } from "lucide-react";
import {
  useOrder,
  useAcknowledgeOrder,
  useMarkReadyForDelivery,
  useCreateFulfillment,
  useDispatchFulfillment,
  useOrderFulfillmentExceptions,
  useResolveReceiptException,
} from "@/lib/hooks/useOrders";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge, DeliveryStatusBadge, ExceptionResolutionBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { DeliveryTypeMenu } from "@/components/orders/DeliveryTypeMenu";
import { FulfillmentModal, FulfillmentFormData } from "@/components/orders/FulfillmentModal";
import { ItemFulfillmentDrawer } from "@/components/orders/ItemFulfillmentDrawer";
import { ResolutionModal } from "@/components/orders/ResolutionModal";
import { EvidenceGallery } from "@/components/orders/EvidenceGallery";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import { formatCurrency, formatDate, formatDateTime, parseExceptionReason, formatExceptionReason, getUniqueLineReasons, enrichFulfillmentsWithReceipts, cn } from "@/lib/utils";
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

// ── Fulfillment state badge helper ──
function FulfillmentStateBadge({ state }: { state?: string }) {
  if (!state || state === "not_started") return null;
  const map: Record<string, { label: string; cls: string }> = {
    partially_ready: { label: "Partially Fulfilled", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    fully_ready:     { label: "Fully Fulfilled",     cls: "bg-green-50 text-green-700 border-green-200" },
    backordered:     { label: "Backordered",         cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const entry = map[state];
  if (!entry) return null;
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium border inline-flex w-fit", entry.cls)}>
      {entry.label}
    </span>
  );
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

// ── Fulfillment History Card ──
function FulfillmentHistorySection({
  notices,
  onDispatch,
  isDispatching,
  localResolutions = {},
  onOpenResolution,
}: {
  notices: Fulfillment[];
  onDispatch: (fulfillmentId: string) => void;
  isDispatching: (fulfillmentId: string) => boolean;
  localResolutions?: Record<string, any>;
  onOpenResolution: (
    notice: Fulfillment,
    index: number,
    targetItemId?: string | null,
    initialAction?: VendorResolutionAction
  ) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDispatchId, setConfirmDispatchId] = useState<string | null>(null);

  if (!notices || notices.length === 0) return null;

  const methodLabel: Record<string, string> = {
    carrier: "Carrier",
    vendor_truck: "Vendor Truck",
    digital: "Digital",
    service: "Service",
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
          const method = notice.fulfillmentMethod || "unknown";
          const isPhysical = ["carrier", "vendor_truck"].includes(method);
          
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

          // Backend display rule: Show one action panel at a time using vendorActionRequired and companyActionRequired
          const isResolvedAfterDispute = notice.resolutionStatus === "resolved_after_dispute";
          const isCompanyActionRequired =
            !isResolvedAfterDispute &&
            (notice.companyActionRequired === true ||
              notice.resolutionStatus === "under_company_review" ||
              local?.status === "disputed");
          const isVendorActionRequired =
            !local &&
            !isResolvedAfterDispute &&
            !isCompanyActionRequired &&
            (notice.vendorActionRequired === true ||
              (notice.vendorActionRequired !== false &&
                (notice.resolutionStatus === "awaiting_vendor_response" ||
                  (!notice.resolutionStatus &&
                    (notice.inspectionOutcome === "accepted_with_exceptions" ||
                      notice.inspectionOutcome === "rejected" ||
                      notice.confirmationOutcome === "confirmed_with_exceptions" ||
                      totalExceptionUnits > 0)))));

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
                className="w-full px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {titlePrefix} #{idx + 1}
                      </p>
                      {notice.receiptNumber && (
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {notice.receiptNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notice.readyAt ? formatDateTime(notice.readyAt) : "—"} · {methodLabel[method] || method} · {notice.declaration === "partial" ? "Partial" : "Full"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                  {isResolvedAfterDispute ? (
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
                      <AlertCircle className="h-3 w-3" /> {exceptionSummaryText || `${totalExceptionUnits} Exception`}
                    </span>
                  ) : isPhysical ? (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium border",
                      notice.dispatchStatus === "dispatched"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {notice.dispatchStatus === "dispatched" ? "Dispatched" : "Awaiting Dispatch"}
                    </span>
                  ) : null}
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-6 pb-4 space-y-3">
                  {/* ── Action Panel 1: Vendor Action Required ── */}
                  {isVendorActionRequired && (() => {
                    const parsedReason = parseExceptionReason(notice.rejectionReason || lineReasons);
                    return (
                      <div className="p-3.5 rounded-xl bg-red-50/80 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-red-700 flex-wrap">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                            <span>
                              Buyer reported {exceptionSummaryText || `${totalExceptionUnits} exception units`}
                            </span>
                            {parsedReason.categories && parsedReason.categories.length > 0 ? (
                              parsedReason.categories.map((cat, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] font-semibold bg-red-200/70 text-red-900 px-2 py-0.5 rounded-full"
                                >
                                  {cat}
                                </span>
                              ))
                            ) : parsedReason.category ? (
                              <span className="text-[11px] font-semibold bg-red-200/70 text-red-900 px-2 py-0.5 rounded-full">
                                {parsedReason.category}
                              </span>
                            ) : null}
                          </div>
                          {parsedReason.text && (
                            <p className="text-red-600 leading-relaxed pl-5.5">
                              <span className="font-semibold text-red-700">Reason: </span>
                              {parsedReason.text}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-5.5 sm:pl-0">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenResolution(notice, idx, null, "backorder");
                            }}
                            className="h-8.5 px-4 text-xs font-semibold bg-[#00b29a] hover:bg-[#009b86] text-white shadow-xs"
                          >
                            Review & Resolve Exceptions
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

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
                        {notice.vendorResponseReason && (
                          <p className="text-purple-800 pl-5.5">
                            <span className="font-semibold">Your dispute note: </span>
                            {notice.vendorResponseReason}
                          </p>
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
                      <p className="text-sm font-medium font-mono text-muted-foreground truncate" title={notice.fulfillmentReference || undefined}>
                        {notice.fulfillmentReference ? notice.fulfillmentReference.split('-').pop() : "—"}
                      </p>
                    </div>
                    {["carrier", "vendor_truck"].includes(method) && (
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
                    )}
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
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground">Item</th>
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground">Shipped Qty</th>
                        <th className="py-2.5 text-left text-xs font-semibold text-muted-foreground">Buyer Inspection</th>
                        <th className="py-2.5 text-right text-xs font-semibold text-muted-foreground">Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notice.lineItems.map((li) => {
                        const itemRejected = li.quantityRejected || 0;
                        const itemMissing = li.quantityMissing || 0;
                        const itemExceptionCount = itemRejected + itemMissing;
                        const itemAccepted = li.quantityAccepted ?? li.quantityReceived ?? 0;

                        const hasFinalDecision =
                          isResolvedAfterDispute ||
                          li.resolutionStatus === "resolved_after_dispute" ||
                          li.finalQuantityAccepted != null;

                        const effectiveAccepted = hasFinalDecision
                          ? li.finalQuantityAccepted ?? itemAccepted
                          : itemAccepted;
                        const effectiveRejected = hasFinalDecision
                          ? li.finalQuantityRejected ?? itemRejected
                          : itemRejected;
                        const effectiveMissing = hasFinalDecision
                          ? li.finalQuantityMissing ?? itemMissing
                          : itemMissing;

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
                              {(li.exceptionReason || li.rejectionReason) && (
                                <p className="text-[11px] font-normal text-muted-foreground mt-0.5">
                                  {formatExceptionReason(li.exceptionReason || li.rejectionReason)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 text-muted-foreground font-medium">
                              {li.quantityReady ?? li.quantityShipped} units
                            </td>
                            <td className="py-3 text-xs">
                              {hasFinalDecision ? (
                                <div className="space-y-1">
                                  <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    Final: {effectiveAccepted} Accepted
                                    {effectiveRejected > 0 ? ` · ${effectiveRejected} Rejected` : ""}
                                    {effectiveMissing > 0 ? ` · ${effectiveMissing} Missing` : ""}
                                  </span>
                                  <p className="text-[11px] text-muted-foreground">
                                    Original Finding (History): {itemAccepted} Accepted
                                    {itemRejected > 0 ? ` · ${itemRejected} Rejected` : ""}
                                    {itemMissing > 0 ? ` · ${itemMissing} Missing` : ""}
                                  </p>
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
                              ) : (li.quantityReady ?? li.quantityShipped) === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (li.quantityReceived === (li.quantityReady ?? li.quantityShipped) || itemAccepted === (li.quantityReady ?? li.quantityShipped)) && itemAccepted > 0 ? (
                                <span className="text-green-700 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> All {itemAccepted} Accepted
                                </span>
                              ) : (li.quantityReceived || 0) > 0 ? (
                                <span>{li.quantityReceived} Received, {li.quantityAwaitingReceipt} Awaiting Inspection</span>
                              ) : (
                                <span className="text-muted-foreground">Awaiting Inspection</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              {itemExceptionCount > 0 ? (
                                hasFinalDecision ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Resolved After Dispute
                                  </span>
                                ) : lineDisposition === "dispute" ||
                                  lineResolutionStatus === "under_company_review" ||
                                  lineResolutionStatus === "disputed" ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                                    <ShieldAlert className="h-3.5 w-3.5 text-purple-600" /> Disputed (Under Review)
                                  </span>
                                ) : lineDisposition === "backorder" ||
                                  lineResolutionStatus === "backordered" ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#f0faf8] text-[#00b29a] border border-[#cbf0eb] inline-flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5 text-[#00b29a]" /> Backordered
                                    {lineRedeliveryDate ? ` (${formatDate(lineRedeliveryDate)})` : ""}
                                  </span>
                                ) : lineDisposition === "forfeit" ||
                                  lineResolutionStatus === "forfeited" ? (
                                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                                    <XCircle className="h-3.5 w-3.5 text-rose-600" /> Forfeited
                                  </span>
                                ) : isVendorActionRequired ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onOpenResolution(notice, idx, li.purchaseOrderLineItemId, "backorder")}
                                    className="h-7 px-3 text-xs font-semibold border-[#00b29a] text-[#00b29a] hover:bg-[#00b29a]/10"
                                  >
                                    Resolve Item
                                  </Button>
                                ) : (
                                  <ExceptionResolutionBadge status={lineResolutionStatus || notice.resolutionStatus} />
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

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
// Shows vendors what the buyer has confirmed receiving vs what was dispatched.
function ReceiptConfirmationSection({
  lineItems,
  fulfillments = [],
}: {
  lineItems: OrderLineItem[];
  fulfillments?: Fulfillment[];
}) {
  // Only show once at least one item has dispatched, received, accepted, or forfeited quantities
  const hasAnyActivity = lineItems.some(
    (item) =>
      (item.quantityDispatched || 0) > 0 ||
      (item.quantityReceived || 0) > 0 ||
      (item.quantityAccepted || 0) > 0 ||
      (item.quantityForfeited || 0) > 0
  );
  if (!hasAnyActivity) return null;

  // Derive per-line awaiting/dispatched quantities reconciled with resolved fulfillments
  const normalizedLines = lineItems.map((item) => {
    const hasFulfillments = fulfillments.length > 0;
    const realFulfillmentAwaiting = hasFulfillments
      ? fulfillments.reduce((sum, f) => {
          const isResolved =
            f.resolutionStatus === "resolved_after_dispute" ||
            f.finalDecision === "accept_vendor_dispute" ||
            f.confirmationOutcome === "confirmed";
          if (isResolved) return sum;
          const match = f.lineItems.find(
            (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
          );
          if (!match) return sum;
          return sum + (match.quantityAwaitingReceipt || 0);
        }, 0)
      : (item.quantityAwaitingReceipt || 0);

    const received = item.quantityAccepted ?? item.quantityReceived ?? 0;
    const forfeited = item.quantityForfeited || 0;
    const rawDispatched = item.quantityDispatched || 0;

    const dispatched =
      hasFulfillments && rawDispatched > received + forfeited + realFulfillmentAwaiting
        ? received + forfeited + realFulfillmentAwaiting
        : rawDispatched;

    return {
      ...item,
      normalizedDispatched: dispatched,
      normalizedReceived: received,
      normalizedForfeited: forfeited,
      normalizedAwaiting: realFulfillmentAwaiting,
    };
  });

  const totalDispatched = normalizedLines.reduce((sum, item) => sum + item.normalizedDispatched, 0);
  const totalReceived = normalizedLines.reduce((sum, item) => sum + item.normalizedReceived, 0);
  const totalForfeited = normalizedLines.reduce((sum, item) => sum + item.normalizedForfeited, 0);
  const totalAwaiting = normalizedLines.reduce((sum, item) => sum + item.normalizedAwaiting, 0);

  return (
    <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Receipt Confirmation</h2>
        </div>
        {totalAwaiting > 0 ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200">
            {totalAwaiting} awaiting confirmation
          </span>
        ) : totalReceived > 0 ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-green-50 text-green-700 border-green-200">
            All confirmed
          </span>
        ) : null}
      </div>

      {/* Summary stats */}
      <div
        className={cn(
          "grid gap-4 px-6 py-4 bg-muted/20 border-b border-border/60",
          totalForfeited > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
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
        {totalForfeited > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold text-red-600">{totalForfeited}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Forfeited</p>
          </div>
        )}
        <div className="text-center">
          <p className={cn("text-lg font-bold", totalAwaiting > 0 ? "text-amber-600" : "text-muted-foreground")}>{totalAwaiting}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Awaiting</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalDispatched > 0 && (
        <div className="px-6 py-3 border-b border-border/60">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Buyer confirmation progress</span>
            <span className="font-medium text-foreground">{totalDispatched > 0 ? Math.round((totalReceived / totalDispatched) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${totalDispatched > 0 ? Math.min(100, (totalReceived / totalDispatched) * 100) : 0}%` }}
            />
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
              const forfeited = item.normalizedForfeited;
              const awaiting = item.normalizedAwaiting;

              // Skip items with no dispatch/receipt activity at all
              if (dispatched === 0 && received === 0 && forfeited === 0) return null;

              return (
                <tr key={item.purchaseOrderLineItemId} className="border-b border-border/40">
                  <td className="px-6 py-3 text-sm font-medium">{item.name}</td>
                  <td className="px-6 py-3 text-sm">{dispatched}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className={cn("font-medium", received > 0 ? "text-green-700" : "text-muted-foreground")}>
                      {received}
                    </span>
                  </td>
                  {totalForfeited > 0 && (
                    <td className="px-6 py-3 text-sm">
                      <span className={cn("font-medium", forfeited > 0 ? "text-red-600" : "text-muted-foreground")}>
                        {forfeited}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-3 text-sm">
                    <span className={cn("font-medium", awaiting > 0 ? "text-amber-600" : "text-muted-foreground")}>
                      {awaiting}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {dispatched === 0 ? (
                      <span className="text-xs text-muted-foreground">Not dispatched</span>
                    ) : received >= dispatched ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">
                        All Accepted
                      </span>
                    ) : received > 0 ? (
                      <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md font-medium">
                        Partially Accepted
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">
                        Awaiting Confirmation
                      </span>
                    )}
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
  const { data: receiptExceptions } = useOrderFulfillmentExceptions(id);
  const acknowledge = useAcknowledgeOrder();
  const readyForDelivery = useMarkReadyForDelivery();
  const createFulfillment = useCreateFulfillment();
  const dispatchFulfillmentMutation = useDispatchFulfillment();
  const resolveReceiptException = useResolveReceiptException();

  // Per-item delivery dates entered before acknowledging
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

  const { data: invoicesData } = useInvoices({ purchaseOrderId: id });

  useEffect(() => {
    if (!order) return;
    setDraftDates((prev) => {
      const next = { ...prev };
      for (const item of order.lineItems) {
        if (!(item.purchaseOrderLineItemId in next)) {
          next[item.purchaseOrderLineItemId] = item.deliveryDate ?? "";
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
      toast.error("Please enter a delivery date for every item before acknowledging.");
      return;
    }
    acknowledge.mutate({
      purchaseOrderId: order.purchaseOrderId,
      payload: {
        lineItems: order.lineItems.map((item) => ({
          purchaseOrderLineItemId: item.purchaseOrderLineItemId,
          deliveryDate: draftDates[item.purchaseOrderLineItemId],
        })),
      },
    });
  };

  const handleDeliveryTypeSelect = (type: DeliveryType) => {
    setModalDeclaration(type);
    setFulfillmentModalOpen(true);
  };

  const handleFulfillmentSubmit = (data: FulfillmentFormData) => {
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

    createFulfillment.mutate(
      {
        purchaseOrderId: order.purchaseOrderId,
        payload: {
          fulfillmentReference: data.fulfillmentReference || `FUL-${crypto.randomUUID().slice(0, 8)}`,
          declaration: data.declaration,
          fulfillmentMethod: data.fulfillmentMethod as any,
          readyAt: new Date().toISOString(),
          expectedDeliveryDate: data.expectedDeliveryDate,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          packingSlipNumber: data.packingSlipNumber,
          notes: data.notes,
          lineItems: data.lineItems.map(li => {
            const reason = li.reason || li.dispositionReason;
            return {
              purchaseOrderLineItemId: li.purchaseOrderLineItemId,
              quantityReady: li.quantityReady,
              ...(li.remainingDisposition ? { remainingDisposition: li.remainingDisposition as any } : {}),
              ...(li.expectedReadyDate ? { expectedReadyDate: li.expectedReadyDate } : {}),
              ...(reason ? { reason } : {}),
            };
          }),
        },
      },
      {
        onSuccess: () => {
          setFulfillmentModalOpen(false);
        },
      }
    );
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

  const renderCTA = () => {
    const buttons = [];

    // 1. Acknowledge Action
    if (order.status === "issued") {
      buttons.push(
        <Button
          key="acknowledge"
          variant="primary"
          loading={acknowledge.isPending}
          disabled={!allDatesEntered}
          onClick={handleAcknowledge}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Acknowledge Order
        </Button>
      );
    }

    // 2. Fulfill Action
    if (
      [
        "acknowledged",
        "ready_for_delivery",
        "partially_delivered",
        "partially_delivered_with_exceptions",
        "delivered_with_exceptions",
      ].includes(order.status)
    ) {
      if (hasItemsToFulfill) {
        const isSubsequent = (order.fulfillments?.length || order.deliveryNotices?.length || 0) > 0;
        const hasPendingException = activeRejectionNotices.length > 0;
        buttons.push(
          <DeliveryTypeMenu
            key="fulfill"
            isConfirmingFull={createFulfillment.isPending}
            onSelect={handleDeliveryTypeSelect}
            trigger={
              <Button
                variant={hasPendingException ? "outline" : "primary"}
                loading={createFulfillment.isPending}
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                {isSubsequent ? "Fulfill Remaining" : "Declare Fulfillment"}
              </Button>
            }
          />
        );
      }
    }

    // 3. Invoice Actions
    if (canCreateInvoice) {
      buttons.push(
        <Button key="create-invoice" asChild variant={buttons.length > 0 ? "outline" : "primary"}>
          <Link href={`/invoices/create?purchaseOrderId=${order.purchaseOrderId}`}>
            <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
            Create Invoice
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

    return <>{buttons}</>;
  };

  const rawNotices: Fulfillment[] = order.fulfillments || order.deliveryNotices || [];
  const combinedReceipts: FulfillmentExceptionDetail[] = [
    ...(order.receiptConfirmations || []),
    ...(order.receipts || []),
    ...(order.deliveryReceipts || []),
    ...(receiptExceptions || []),
  ];
  const allNotices: Fulfillment[] = enrichFulfillmentsWithReceipts(rawNotices, combinedReceipts);

  // Identify fulfillments with buyer exceptions awaiting vendor response (vendorActionRequired)
  const activeRejectionNotices = allNotices
    .map((f, idx) => {
      const local = localResolutions[f.vendorDeliveryNoticeId];
      const totalDelivered =
        f.totalDeliveredQuantity ??
        f.lineItems.reduce((sum, li) => sum + (li.quantityReady || li.quantityShipped || 0), 0);
      const totalAccepted =
        f.totalAcceptedQuantity ??
        f.lineItems.reduce((sum, li) => sum + (li.quantityAccepted ?? li.quantityReceived ?? 0), 0);
      const totalMissing =
        f.totalMissingQuantity ??
        f.lineItems.reduce((sum, li) => sum + (li.quantityMissing || 0), 0);
      let totalRejected =
        f.totalRejectedQuantity ??
        f.lineItems.reduce((sum, li) => sum + (li.quantityRejected || 0), 0);

      if (
        !totalRejected &&
        !totalMissing &&
        (f.inspectionOutcome === "accepted_with_exceptions" ||
          f.inspectionOutcome === "rejected" ||
          f.confirmationOutcome === "confirmed_with_exceptions")
      ) {
        totalRejected = Math.max(0, totalDelivered - totalAccepted);
      }

      const totalExceptionUnits = totalRejected + totalMissing;
      const lineItemsWithException = f.lineItems.filter(
        (li) => (li.quantityRejected || 0) + (li.quantityMissing || 0) > 0
      );
      const unresolvedItems = lineItemsWithException.filter(
        (li) => !local?.itemResolutions?.[li.purchaseOrderLineItemId]
      );

      const isAwaiting =
        (!local || (local.itemResolutions && unresolvedItems.length > 0)) &&
        f.resolutionStatus !== "resolved_after_dispute" &&
        f.resolutionStatus !== "under_company_review" &&
        f.resolutionStatus !== "backordered" &&
        f.resolutionStatus !== "forfeited" &&
        f.companyActionRequired !== true &&
        (f.vendorActionRequired === true ||
          (f.vendorActionRequired !== false &&
            (f.resolutionStatus === "awaiting_vendor_response" ||
              (!f.resolutionStatus &&
                (f.inspectionOutcome === "accepted_with_exceptions" ||
                  f.inspectionOutcome === "rejected" ||
                  f.confirmationOutcome === "confirmed_with_exceptions" ||
                  totalExceptionUnits > 0)))));

      return {
        fulfillment: f,
        index: idx,
        totalRejected,
        totalMissing,
        totalExceptionUnits,
        isAwaiting,
      };
    })
    .filter((item) => item.isAwaiting);

  const totalAllRejected = activeRejectionNotices.reduce(
    (acc, item) => acc + item.totalExceptionUnits,
    0
  );
  const isEnteringDates = order.status === "issued";

  return (
    <div className="space-y-5">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-dashboard-bg/95 backdrop-blur-sm -mx-4 px-4 sm:-mx-6 sm:px-6 -mt-4 pt-4 sm:-mt-6 sm:pt-6 pb-4 border-b border-border mb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold">{order.poNumber}</h1>
                {order.deliveryOutcome &&
                order.deliveryOutcome !== "not_delivered" &&
                !["cancelled", "closed"].includes(order.status) ? (
                  <DeliveryStatusBadge status={order.deliveryOutcome} />
                ) : (
                  <OrderStatusBadge status={order.status} />
                )}
                {order.resolutionStatus && order.resolutionStatus !== "not_required" && (
                  <ExceptionResolutionBadge status={order.resolutionStatus} />
                )}
                {order.fulfillmentState && order.fulfillmentState !== "not_started" && (
                  <FulfillmentStateBadge state={order.fulfillmentState} />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Issued on {formatDate(order.issueDate)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">{renderCTA()}</div>
        </div>
      </div>

      {/* ── Single Shipment Exception Banner (Vendor Action Required) ── */}
      {activeRejectionNotices.length === 1 && (() => {
        const { fulfillment, index, totalRejected, totalMissing, totalExceptionUnits } =
          activeRejectionNotices[0];
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
        const parsedReason = parseExceptionReason(
          fulfillment.rejectionReason || getUniqueLineReasons(fulfillment.lineItems)
        );

        return (
          <div
            key={fulfillment.vendorDeliveryNoticeId}
            className="p-4 rounded-xl bg-red-50/90 border border-red-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-100 text-red-600 shrink-0 mt-0.5">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-red-900">
                    Buyer reported {summaryLabel} on Shipment #{index + 1}
                  </p>
                  {fulfillment.receiptNumber && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/80 text-red-800 border border-red-200">
                      {fulfillment.receiptNumber}
                    </span>
                  )}
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-200/70 text-red-800">
                    Action Required
                  </span>
                </div>
                {(parsedReason.category || parsedReason.text || (fulfillment.evidence && fulfillment.evidence.length > 0)) && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-red-700 mt-1">
                    {(parsedReason.category || parsedReason.text) && (
                      <>
                        <span className="font-semibold text-red-800">Reason:</span>
                        {parsedReason.categories && parsedReason.categories.length > 0 ? (
                          parsedReason.categories.map((cat, i) => (
                            <span
                              key={i}
                              className="font-semibold text-[11px] bg-red-200/60 text-red-900 px-2 py-0.5 rounded-md"
                            >
                              {cat}
                            </span>
                          ))
                        ) : parsedReason.category ? (
                          <span className="font-semibold text-[11px] bg-red-200/60 text-red-900 px-2 py-0.5 rounded-md">
                            {parsedReason.category}
                          </span>
                        ) : null}
                        {parsedReason.text && <span>{parsedReason.text}</span>}
                      </>
                    )}
                    {fulfillment.evidence && fulfillment.evidence.length > 0 && (
                      <EvidenceGallery
                        buyerEvidence={fulfillment.evidence}
                        variant="pill"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center pl-10 md:pl-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenResolution(fulfillment, index, null, "dispute")}
                className="h-8.5 px-4 text-xs font-semibold border-purple-300 text-purple-700 hover:bg-purple-50"
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
                Review & Resolve
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ── Consolidated Multi-Shipment Exception Banner (When 2+ Shipments Have Exceptions) ── */}
      {activeRejectionNotices.length > 1 && (
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
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-200 text-red-800">
                    Action Required
                  </span>
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
                          {fulfillment.receiptNumber && (
                            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                              {fulfillment.receiptNumber}
                            </span>
                          )}
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
                            {parsedReason.text && <span>{parsedReason.text}</span>}
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
        <div className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Enter the delivery date for every item below before acknowledging.
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-4">
          {/* ── Order Details Card ── */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-4">
            <h2 className="text-base font-semibold">Order Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-border">
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
                <p className="text-sm font-semibold mt-0.5">{formatDate(order.deliveryDate)}</p>
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
          <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">
                Items <span className="text-muted-foreground font-normal ml-1">{order.lineItems.length}</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Quantity</th>
                    {isEnteringDates ? (
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery date</th>
                    ) : (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Fulfillment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Unit Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Line Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {order.lineItems.map((item) => {
                    const fulfillmentSent = allNotices.reduce((sum, f) => {
                      const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId);
                      return sum + (match?.quantityReady || match?.quantityShipped || 0);
                    }, 0);
                    const qtyReady = fulfillmentSent > 0 ? fulfillmentSent : (item.quantityReady || 0);
                    const isCancelled = item.remainingDisposition === "cannot_fulfill";
                    const isFullyReady = qtyReady >= item.quantity;
                    
                    return (
                      <tr
                        key={item.purchaseOrderLineItemId}
                        onClick={() => !isEnteringDates && setSelectedItemForDrawer(item)}
                        className={cn(
                          "border-b border-border/60 hover:bg-muted/30 transition-colors",
                          !isEnteringDates && "cursor-pointer",
                          isCancelled ? "bg-red-50/30" : ""
                        )}
                      >
                        <td className="px-6 py-3.5 text-sm font-medium whitespace-nowrap">{item.name}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground max-w-xs truncate">{item.description}</td>
                        <td className="px-6 py-3.5 text-sm">
                          <span>{item.quantity}</span>
                        </td>
                        {isEnteringDates ? (
                          <td className="px-6 py-3.5">
                            <label htmlFor={`date-${item.purchaseOrderLineItemId}`} className="sr-only">
                              Delivery date for {item.name}
                            </label>
                            <DatePicker
                              date={draftDates[item.purchaseOrderLineItemId] ? new Date(draftDates[item.purchaseOrderLineItemId]) : undefined}
                              onSelect={(d) =>
                                setDraftDates((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: d ? format(d, "yyyy-MM-dd") : "" }))
                              }
                              disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                              className="h-9 px-2.5 min-w-[140px]"
                            />
                          </td>
                        ) : (
                          <>
                            {/* Fulfillment column */}
                            <td className="px-6 py-3.5">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {qtyReady > 0 && (
                                    <span className={cn(
                                      "text-xs px-1.5 py-0.5 rounded-md inline-flex w-fit font-medium border",
                                      isFullyReady 
                                        ? "bg-green-50 text-green-700 border-green-200" 
                                        : "bg-blue-50 text-blue-700 border-blue-200"
                                    )}>
                                      {qtyReady} / {item.quantity} Sent
                                    </span>
                                  )}
                                  {(item.quantityAccepted ?? item.quantityReceived ?? 0) > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-md inline-flex w-fit font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                                      {item.quantityAccepted ?? item.quantityReceived} Accepted
                                    </span>
                                  )}
                                </div>
                                {item.remainingDisposition === "backordered" && (
                                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    Backordered{item.expectedReadyDate ? ` (exp. ${formatDate(item.expectedReadyDate)})` : ""}
                                  </span>
                                )}
                                {isCancelled && (
                                  <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    {item.quantity - qtyReady} Cannot Fulfill
                                  </span>
                                )}
                                {(item.quantityForfeited || 0) > 0 && (
                                  <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    {item.quantityForfeited} Forfeited
                                  </span>
                                )}
                                {(item.shortClosedQuantity || 0) > 0 && (
                                  <span className="text-xs text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    {item.shortClosedQuantity} Short-Closed
                                  </span>
                                )}
                                {(item.reason || item.dispositionReason) && (
                                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    <span className="font-medium">Reason:</span> {item.reason || item.dispositionReason}
                                  </p>
                                )}
                                {!qtyReady && !item.remainingDisposition && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-sm">{formatCurrency(item.unitPrice, order.currency)}</td>
                            <td className="px-6 py-3.5 text-sm font-medium">{formatCurrency(item.lineTotal, order.currency)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Receipt Confirmation (dispatched vs buyer-confirmed) ── */}
          <ReceiptConfirmationSection lineItems={order.lineItems} fulfillments={allNotices} />

          {/* ── Fulfillment History ── */}
          <FulfillmentHistorySection
            notices={allNotices}
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
                    label: "Ready for Delivery",
                    timestamp: timelineByAction["ready_for_delivery"]?.timestamp || order.readyForDeliveryAt,
                    done: !!timelineByAction["ready_for_delivery"] || !!order.readyForDeliveryAt,
                    subtitle: fulfillmentCount > 0 ? `${fulfillmentCount} shipment${fulfillmentCount > 1 ? "s" : ""} created` : undefined,
                  },
                  {
                    id: "delivered",
                    label:
                      order.status === "delivered" || order.status === "delivered_with_exceptions"
                        ? "Delivered"
                        : fulfillmentCount > 0
                        ? `Partially Delivered (${fulfillmentCount}x)`
                        : "Delivered",
                    timestamp: timelineByAction["delivered"]?.timestamp || timelineByAction["partially_delivered"]?.timestamp || order.deliveredAt,
                    done: !!timelineByAction["delivered"] || !!timelineByAction["partially_delivered"] || isDelivered,
                  },
                  {
                    id: "closed",
                    label: "Invoiced",
                    timestamp: timelineByAction["closed"]?.timestamp || order.closedAt,
                    done: !!timelineByAction["closed"] || !!order.closedAt,
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

      <FulfillmentModal
        open={fulfillmentModalOpen}
        onClose={() => setFulfillmentModalOpen(false)}
        onSubmit={handleFulfillmentSubmit}
        lineItems={order.lineItems}
        isSubmitting={createFulfillment.isPending}
        initialDeclaration={modalDeclaration}
      />
      {/* ── Item Fulfillment Drawer ── */}
      <ItemFulfillmentDrawer
        open={!!selectedItemForDrawer}
        onClose={() => setSelectedItemForDrawer(null)}
        item={selectedItemForDrawer}
        fulfillments={allNotices}
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
    </div>
  );
}
