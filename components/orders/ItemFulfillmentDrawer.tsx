"use client";

import React from "react";
import { Package, Truck, Monitor, Wrench, X, History } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Modal";
import { formatDateTime, cn } from "@/lib/utils";
import type { OrderLineItem, Fulfillment } from "@/lib/types";

interface ItemFulfillmentDrawerProps {
  open: boolean;
  onClose: () => void;
  item: OrderLineItem | null;
  fulfillments: Fulfillment[];
}

export function ItemFulfillmentDrawer({
  open,
  onClose,
  item,
  fulfillments,
}: ItemFulfillmentDrawerProps) {
  if (!item) return null;

  // Filter fulfillments that include this item
  const relevantFulfillments = fulfillments
    .map((f) => {
      const lineItem = f.lineItems.find(
        (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
      );
      return { notice: f, lineItem };
    })
    .filter((f) => !!f.lineItem)
    // Sort chronologically by readyAt or shippedAt
    .sort((a, b) => {
      const dateA = new Date(a.notice.readyAt || a.notice.shippedAt).getTime();
      const dateB = new Date(b.notice.readyAt || b.notice.shippedAt).getTime();
      return dateA - dateB;
    });

  const qtyReady = item.quantityReady || 0;
  const isCancelled = item.remainingDisposition === "cannot_fulfill";
  const isFullyReady = qtyReady >= item.quantity;
  const remaining = item.quantity - qtyReady;

  const methodLabel: Record<string, string> = {
    carrier: "Carrier",
    vendor_truck: "Vendor Truck",
    digital: "Digital",
    service: "Service",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" showClose={false} className="p-0 overflow-hidden sm:max-h-[85vh] flex flex-col gap-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-dashboard-bg/50">
          <div>
            <DialogTitle className="text-lg">{item.name}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-sm">
              {item.description || "No description"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Summary Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/30 border border-border/60">
            <div>
              <p className="text-xs text-muted-foreground">Ordered</p>
              <p className="text-base font-semibold mt-0.5">{item.quantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fulfilled</p>
              <p className="text-base font-semibold mt-0.5 text-blue-700">{qtyReady}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-base font-semibold mt-0.5">
                {isCancelled ? 0 : (remaining > 0 ? remaining : 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                {isFullyReady ? (
                  <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">Fully Fulfilled</span>
                ) : isCancelled ? (
                  <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md font-medium">{remaining} Cannot Fulfill</span>
                ) : item.remainingDisposition === "backordered" ? (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">Backordered</span>
                ) : qtyReady > 0 ? (
                  <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md font-medium">Partially Fulfilled</span>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md border border-border">Pending</span>
                )}
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-muted-foreground" />
              Fulfillment Timeline
            </h3>

            {relevantFulfillments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No fulfillments recorded for this item yet.</p>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.25rem] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {(() => {
                  let runningReady = 0;
                  return relevantFulfillments.map((f, idx) => {
                    const method = f.notice.fulfillmentMethod || "unknown";
                    const isPhysical = ["carrier", "vendor_truck"].includes(method);
                    let Icon = Package;
                    if (isPhysical) Icon = Truck;
                    else if (method === "digital") Icon = Monitor;
                    else if (method === "service") Icon = Wrench;

                    const li = f.lineItem!;
                    runningReady += li.quantityReady || 0;
                    const remainingAtTime = Math.max(0, item.quantity - runningReady);

                    const badgeColor =
                      f.notice.dispatchStatus === "dispatched"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-700 border-amber-200";

                    return (
                      <div key={f.notice.vendorDeliveryNoticeId} className="relative flex items-start gap-4 group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-dashboard-bg text-muted-foreground shrink-0 shadow-sm z-10">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 p-4 rounded-xl border border-dashboard-border bg-white shadow-sm space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">
                              {formatDateTime(f.notice.readyAt || f.notice.shippedAt)}
                            </p>
                            {isPhysical && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium border", badgeColor)}>
                                {f.notice.dispatchStatus === "dispatched" ? "Dispatched" : "Awaiting Dispatch"}
                              </span>
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-medium">
                              {li.quantityReady} Fulfilled
                              {li.remainingDisposition && (
                                <span className="text-muted-foreground font-normal">
                                  {" "}· {remainingAtTime} {li.remainingDisposition === "cannot_fulfill" ? "Cannot fulfill remaining" : "Backordered remaining"}
                                  {li.remainingDisposition === "backordered" && li.expectedReadyDate && ` (Expected: ${formatDateTime(li.expectedReadyDate).split(',')[0]})`}
                                </span>
                              )}
                            </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Via {methodLabel[method] || method}
                            {f.notice.carrier && ` (${f.notice.carrier})`}
                          </p>
                        </div>
                        
                        {(li.quantityReceived || 0) > 0 && (
                           <div className="pt-2 border-t border-border/50">
                             <p className="text-xs text-green-700 font-medium">{li.quantityReceived} received by buyer</p>
                           </div>
                        )}
                      </div>
                    </div>
                  );
                })})()}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
