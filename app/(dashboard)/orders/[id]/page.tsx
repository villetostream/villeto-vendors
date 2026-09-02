"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FilePlus2, PackageCheck, Truck } from "lucide-react";
import { useOrder, useAcknowledgeOrder, useCreateFulfillment, useDispatchFulfillment } from "@/lib/hooks/useOrders";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import { FulfillmentModal } from "@/components/orders/FulfillmentModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { format } from "date-fns";
import { CreateFulfillmentPayload, TimelineEvent } from "@/lib/types";
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

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const acknowledge = useAcknowledgeOrder();
  const createFulfillment = useCreateFulfillment();
  const dispatchFulfillment = useDispatchFulfillment();
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);

  // Per-item delivery dates entered before acknowledging. Kept in local
  // state (not just sent to the backend) because acknowledgeOrder's
  // payload/return contract is unconfirmed — if the backend doesn't
  // persist or echo these back, the UI still shows what the vendor
  // entered for the rest of this session. Lost on refresh until backend
  // confirms a real per-item delivery-date field — flagged in types.
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});

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

  const handleCreateFulfillment = (payload: CreateFulfillmentPayload) => {
    createFulfillment.mutate(
      {
        purchaseOrderId: order.purchaseOrderId,
        payload,
      },
      { onSuccess: () => setFulfillmentOpen(false) }
    );
  };

  const handleDispatch = (fulfillmentId: string) => {
    dispatchFulfillment.mutate({
      purchaseOrderId: order.purchaseOrderId,
      fulfillmentId,
      payload: { dispatchReference: `DSP-${crypto.randomUUID()}` },
    });
  };

  const hasOutstandingFulfillment = order.lineItems.some(
    (item) =>
      (item.quantityRemainingToReady ??
        Math.max(item.quantity - (item.quantityReady ?? item.quantityShipped ?? 0), 0)) > 0
  );
  const deliveryTotals = order.lineItems.reduce(
    (totals, item) => ({
      ordered: totals.ordered + item.quantity,
      ready: totals.ready + (item.quantityReady ?? item.quantityShipped ?? 0),
      dispatched: totals.dispatched + (item.quantityDispatched ?? 0),
      received: totals.received + (item.quantityReceived ?? 0),
      awaitingReceipt: totals.awaitingReceipt + (item.quantityAwaitingReceipt ?? 0),
    }),
    { ordered: 0, ready: 0, dispatched: 0, received: 0, awaitingReceipt: 0 }
  );
  const hasPhysicalFulfillment = order.fulfillments?.some(
    (fulfillment) => fulfillment.fulfillmentMethod === "carrier" || fulfillment.fulfillmentMethod === "vendor_truck"
  );
  const deliverySummary =
    deliveryTotals.received >= deliveryTotals.ordered && deliveryTotals.ordered > 0
      ? "Customer confirmed received"
      : deliveryTotals.received > 0
        ? `Partially received · ${deliveryTotals.received} confirmed`
        : deliveryTotals.dispatched > 0
          ? `${hasPhysicalFulfillment ? "Dispatched" : "Fulfilled"} · ${deliveryTotals.awaitingReceipt} awaiting customer confirmation`
          : deliveryTotals.ready > 0
            ? `${deliveryTotals.ready} ready · awaiting dispatch`
            : null;

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
      case "partially_delivered":
        if (hasOutstandingFulfillment) {
          return (
            <Button variant="primary" onClick={() => setFulfillmentOpen(true)}>
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              {order.fulfillments?.length ? "Add fulfillment" : "Declare fulfillment"}
            </Button>
          );
        }
        return canCreateInvoice ? (
          <Button asChild variant="primary">
            <Link href={`/invoices/create?purchaseOrderId=${order.purchaseOrderId}`}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Create an Invoice
            </Link>
          </Button>
        ) : null;
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold">{order.poNumber}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Issued on {formatDate(order.issueDate)}
            </p>
            {deliverySummary && (
              <p className="mt-1 text-xs font-medium text-blue-700">{deliverySummary}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">{renderCTA()}</div>
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
      {order.fulfillmentActionRequired && (
        <div className="text-xs text-red-700 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          The company needs to review a quantity the vendor cannot fulfill.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-4">
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
                <p className="text-xs text-muted-foreground">Deadline</p>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Ordered</th>
                    {isEnteringDates ? (
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery date</th>
                    ) : (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Ready</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Dispatched</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Received</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Awaiting confirmation</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Remaining to ready</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Intent</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Unit Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Line Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {order.lineItems.map((item) => (
                    <tr key={item.purchaseOrderLineItemId} className="border-b border-border/60">
                      <td className="px-6 py-3.5 text-sm font-medium whitespace-nowrap">{item.name}</td>
                      <td className="px-6 py-3.5 text-sm text-muted-foreground max-w-xs truncate">{item.description}</td>
                      <td className="px-6 py-3.5 text-sm">{item.quantity}</td>
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
                          <td className="px-6 py-3.5 text-sm">{item.quantityReady ?? item.quantityShipped ?? 0}</td>
                          <td className="px-6 py-3.5 text-sm">{item.quantityDispatched ?? 0}</td>
                          <td className="px-6 py-3.5 text-sm font-medium text-emerald-700">{item.quantityReceived ?? 0}</td>
                          <td className="px-6 py-3.5 text-sm">{item.quantityAwaitingReceipt ?? 0}</td>
                          <td className="px-6 py-3.5 text-sm font-medium">
                            {item.quantityRemainingToReady ?? Math.max(item.quantity - (item.quantityReady ?? item.quantityShipped ?? 0), 0)}
                          </td>
                          <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                            {item.remainingDisposition === "backordered"
                              ? `Backordered${item.expectedReadyDate ? ` until ${formatDate(item.expectedReadyDate)}` : ""}`
                              : item.remainingDisposition === "cannot_fulfill"
                                ? "Cannot fulfill"
                                : item.fulfillmentState === "fully_ready"
                                  ? "Fully ready"
                                  : "—"}
                          </td>
                          <td className="px-6 py-3.5 text-sm">{formatCurrency(item.unitPrice, order.currency)}</td>
                          <td className="px-6 py-3.5 text-sm font-medium">{formatCurrency(item.lineTotal, order.currency)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(order.fulfillments?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">Fulfillment history</h2>
              </div>
              <div className="divide-y divide-border">
                {order.fulfillments?.map((fulfillment) => (
                  <div key={fulfillment.vendorDeliveryNoticeId} className="px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {fulfillment.fulfillmentReference ?? fulfillment.shipmentReference}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fulfillment.fulfillmentMethod?.replace("_", " ") ?? "Legacy shipment"} · {fulfillment.declaration ?? (fulfillment.isPartial ? "partial" : "full")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          fulfillment.dispatchStatus === "dispatched"
                            ? "bg-blue-50 text-blue-700"
                            : fulfillment.dispatchStatus === "not_applicable"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                        )}>
                          {fulfillment.dispatchStatus === "dispatched"
                            ? "Dispatched"
                            : fulfillment.dispatchStatus === "not_applicable"
                              ? "Fulfilled"
                              : fulfillment.dispatchStatus === "ready"
                                ? "Ready — awaiting dispatch"
                                : "Dispatch unknown"}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(fulfillment.dispatchedAt ?? fulfillment.readyAt ?? fulfillment.shippedAt)}
                        </p>
                      </div>
                    </div>
                    {(fulfillment.carrier || fulfillment.trackingNumber || fulfillment.expectedDeliveryDate) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {[fulfillment.carrier, fulfillment.trackingNumber && `Tracking ${fulfillment.trackingNumber}`, fulfillment.expectedDeliveryDate && `Expected ${formatDate(fulfillment.expectedDeliveryDate)}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {fulfillment.lineItems.map((line) => (
                          <span key={line.vendorDeliveryNoticeLineItemId} className="rounded-lg bg-muted px-2.5 py-1 text-xs">
                            {line.name}: {line.quantityReady ?? line.quantityShipped} ready · {line.quantityReceived ?? 0} received
                            {(line.quantityAwaitingReceipt ?? 0) > 0 ? ` · ${line.quantityAwaitingReceipt} awaiting confirmation` : ""}
                          </span>
                        ))}
                      </div>
                      {fulfillment.dispatchStatus === "ready" &&
                        (fulfillment.fulfillmentMethod === "carrier" || fulfillment.fulfillmentMethod === "vendor_truck") && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={dispatchFulfillment.isPending}
                            onClick={() => handleDispatch(fulfillment.vendorDeliveryNoticeId)}
                          >
                            <Truck className="h-4 w-4" aria-hidden="true" />
                            Mark as dispatched
                          </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
                  },
                  {
                    id: "delivered",
                    label: order.status === "partially_delivered" || timelineByAction["partially_delivered"] ? "Partially Delivered" : "Delivered",
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
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {fulfillmentOpen && (
        <FulfillmentModal
          open={fulfillmentOpen}
          order={order}
          isPending={createFulfillment.isPending}
          onClose={() => setFulfillmentOpen(false)}
          onSubmit={handleCreateFulfillment}
        />
      )}
    </div>
  );
}
