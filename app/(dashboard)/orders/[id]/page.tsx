"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, FilePlus2, Package, Truck, Send, Monitor, Wrench } from "lucide-react";
import {
  useOrder,
  useAcknowledgeOrder,
  useMarkReadyForDelivery,
  useCreateFulfillment,
  useDispatchFulfillment,
} from "@/lib/hooks/useOrders";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import { DeliveryTypeMenu } from "@/components/orders/DeliveryTypeMenu";
import { FulfillmentModal, FulfillmentFormData } from "@/components/orders/FulfillmentModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { format } from "date-fns";
import { Fulfillment, DeliveryType, TimelineEvent } from "@/lib/types";
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

// ── Fulfillment History Card ──
function FulfillmentHistorySection({
  notices,
  onDispatch,
  isDispatching
}: {
  notices: Fulfillment[];
  onDispatch: (fulfillmentId: string) => void;
  isDispatching: (fulfillmentId: string) => boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
                    <p className="text-sm font-medium truncate">
                      {titlePrefix} #{idx + 1}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notice.readyAt ? formatDateTime(notice.readyAt) : "—"} · {methodLabel[method] || method} · {notice.declaration === "partial" ? "Partial" : "Full"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {isPhysical && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium border",
                      notice.dispatchStatus === "dispatched"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {notice.dispatchStatus === "dispatched" ? "Dispatched" : "Awaiting Dispatch"}
                    </span>
                  )}
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-6 pb-4 space-y-3">
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
                        <th className="py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                        <th className="py-2 text-left text-xs font-medium text-muted-foreground">Included Qty</th>
                        <th className="py-2 text-left text-xs font-medium text-muted-foreground">Status (Buyer)</th>
                        <th className="py-2 text-left text-xs font-medium text-muted-foreground">Remaining Disposition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notice.lineItems.map((li) => {
                        // Sum of quantityReady shipped in ALL previous notices (before this one)
                        const previousCumulativeReady = notices
                          .slice(0, idx)
                          .reduce((sum, pastNotice) => {
                            const match = pastNotice.lineItems.find(x => x.purchaseOrderLineItemId === li.purchaseOrderLineItemId);
                            return sum + (match?.quantityReady || 0);
                          }, 0);

                        // Sum including this shipment — used for remaining disposition
                        const cumulativeReady = previousCumulativeReady + (li.quantityReady || 0);

                        // What was remaining BEFORE this shipment (denominator for Included Qty)
                        const remainingBeforeThisShipment = li.quantityOrdered - previousCumulativeReady;

                        // What is remaining AFTER this shipment (for disposition badge)
                        const remainingToFulfill = li.quantityOrdered - cumulativeReady;

                        return (
                        <tr key={li.vendorDeliveryNoticeLineItemId} className="border-b border-border/40">
                          <td className="py-2 font-medium">{li.name}</td>
                          <td className="py-2">
                            {li.quantityReady} <span className="text-muted-foreground">/ {remainingBeforeThisShipment} remaining</span>
                          </td>
                          <td className="py-2 text-xs">
                            {notice.dispatchStatus !== "dispatched" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : li.quantityReady === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : li.quantityReceived === li.quantityReady ? (
                              <span className="text-green-600 font-medium">All Received</span>
                            ) : (li.quantityReceived || 0) > 0 ? (
                              <span>{li.quantityReceived} Received, {li.quantityAwaitingReceipt} Awaiting Confirmation</span>
                            ) : (
                              <span className="text-muted-foreground">Awaiting Confirmation</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-col gap-1 items-start">
                              {remainingToFulfill <= 0 ? (
                                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">Fully Fulfilled</span>
                              ) : li.remainingDisposition === "cannot_fulfill" ? (
                                <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md font-medium">
                                  {remainingToFulfill} Cannot Fulfill
                                </span>
                              ) : li.remainingDisposition === "backordered" ? (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">
                                  {remainingToFulfill} Backordered{li.expectedReadyDate ? ` (${formatDate(li.expectedReadyDate)})` : ""}
                                </span>
                              ) : (li.quantityReady || 0) > 0 ? (
                                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">Fully Ready</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Will fulfill later</span>
                              )}
                              {li.dispositionReason && (
                                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                  <span className="font-medium">Reason:</span> {li.dispositionReason}
                                </p>
                              )}
                            </div>
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
                          onDispatch(notice.vendorDeliveryNoticeId);
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
    </div>
  );
}


export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const acknowledge = useAcknowledgeOrder();
  const readyForDelivery = useMarkReadyForDelivery();
  const createFulfillment = useCreateFulfillment();
  const dispatchFulfillmentMutation = useDispatchFulfillment();

  // Per-item delivery dates entered before acknowledging
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});

  // Fulfillment modal state
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [modalDeclaration, setModalDeclaration] = useState<DeliveryType>("full");

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

  const canCreateInvoice = ["partially_delivered", "delivered", "closed"].includes(order.status);
  const allDatesEntered = order.lineItems.every((item) => !!draftDates[item.purchaseOrderLineItemId]);

  // Helper: how many units are still fulfillable for an item
  const getRemainingToReady = (item: typeof order.lineItems[0]) => {
    if (item.remainingDisposition === "cannot_fulfill") return 0;
    return item.quantityRemainingToReady ?? (item.quantity - (item.quantityReady || 0));
  };

  const hasItemsToFulfill = order.lineItems.some(item => getRemainingToReady(item) > 0);

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
        return false;
      });

      if (invalidItems.length > 0) {
        toast.error("Please complete all disposition fields for partial quantities.");
        return;
      }
    }

    createFulfillment.mutate(
      {
        purchaseOrderId: order.purchaseOrderId,
        payload: {
          fulfillmentReference: `FUL-${crypto.randomUUID().slice(0, 8)}`,
          declaration: data.declaration,
          fulfillmentMethod: data.fulfillmentMethod as any,
          expectedDeliveryDate: data.expectedDeliveryDate,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          packingSlipNumber: data.packingSlipNumber,
          notes: data.notes,
          lineItems: data.lineItems.map(li => ({
            purchaseOrderLineItemId: li.purchaseOrderLineItemId,
            quantityReady: li.quantityReady,
            ...(li.remainingDisposition ? { remainingDisposition: li.remainingDisposition as any } : {}),
            ...(li.expectedReadyDate ? { expectedReadyDate: li.expectedReadyDate } : {}),
          })),
        },
      },
      {
        onSuccess: () => {
          setFulfillmentModalOpen(false);
        },
      }
    );
  };

  const renderCTA = () => {
    switch (order.status) {
      case "issued":
        return (
          <Button
            variant="primary"
            loading={acknowledge.isPending}
            disabled={!allDatesEntered}
            onClick={handleAcknowledge}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Acknowledge Order
          </Button>
        );
      case "acknowledged":
      case "ready_for_delivery":
      case "partially_delivered": {
        const isSubsequent = (order.fulfillments?.length || order.deliveryNotices?.length || 0) > 0;
        return hasItemsToFulfill ? (
          <DeliveryTypeMenu
            isConfirmingFull={createFulfillment.isPending}
            onSelect={handleDeliveryTypeSelect}
            trigger={
              <Button variant="primary" loading={createFulfillment.isPending}>
                <Package className="h-4 w-4" aria-hidden="true" />
                {isSubsequent ? "Fulfill Remaining" : "Declare Fulfillment"}
              </Button>
            }
          />
        ) : null;
      }
      default:
        return canCreateInvoice ? (
          <Button asChild variant="primary">
            <Link href={`/invoices/create?purchaseOrderId=${order.purchaseOrderId}`}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Create an Invoice
            </Link>
          </Button>
        ) : null;
    }
  };

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
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold">{order.poNumber}</h1>
                <OrderStatusBadge status={order.status} />
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
              <table className="w-full">
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
                    const qtyReady = item.quantityReady || 0;
                    const isCancelled = item.remainingDisposition === "cannot_fulfill";
                    const isFullyReady = qtyReady >= item.quantity;
                    
                    return (
                      <tr
                        key={item.purchaseOrderLineItemId}
                        className={cn(
                          "border-b border-border/60",
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
                                {qtyReady > 0 && (
                                  <span className={cn(
                                    "text-xs px-1.5 py-0.5 rounded-md inline-flex w-fit font-medium border",
                                    isFullyReady 
                                      ? "bg-green-50 text-green-700 border-green-200" 
                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                  )}>
                                    {qtyReady} / {item.quantity} Fulfilled
                                  </span>
                                )}
                                {item.remainingDisposition === "backordered" && (
                                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    Backordered{item.expectedReadyDate ? ` (exp. ${formatDate(item.expectedReadyDate)})` : ""}
                                  </span>
                                )}
                                {isCancelled && (
                                  <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md w-fit font-medium">
                                    Cannot Fulfill
                                  </span>
                                )}
                                {item.dispositionReason && (
                                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    <span className="font-medium">Reason:</span> {item.dispositionReason}
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

          {/* ── Fulfillment History ── */}
          <FulfillmentHistorySection
            notices={order.fulfillments || order.deliveryNotices || []}
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

                const isDelivered = order.status === "partially_delivered" || order.status === "delivered";
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
                    label: order.status === "delivered" ? "Delivered" : (fulfillmentCount > 0 ? `Partially Delivered (${fulfillmentCount}x)` : "Delivered"),
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

      {/* ── Fulfillment Modal ── */}
      <FulfillmentModal
        open={fulfillmentModalOpen}
        onClose={() => setFulfillmentModalOpen(false)}
        onSubmit={handleFulfillmentSubmit}
        lineItems={order.lineItems}
        isSubmitting={createFulfillment.isPending}
        initialDeclaration={modalDeclaration}
      />
    </div>
  );
}
