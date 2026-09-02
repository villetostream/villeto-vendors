"use client";

import React, { useState, useEffect } from "react";
import { Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { formatDate } from "@/lib/utils";
import { format } from "date-fns";
import type { OrderLineItem, DeliveryType } from "@/lib/types";

// ── Types ──

interface FulfillmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FulfillmentFormData) => void;
  lineItems: OrderLineItem[];
  isSubmitting: boolean;
  /** Pre-selected declaration from the dropdown */
  initialDeclaration?: DeliveryType;
}

export interface FulfillmentFormData {
  declaration: DeliveryType;
  fulfillmentMethod: string;
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  notes?: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    quantityReady: number;
    remainingDisposition?: string;
    expectedReadyDate?: string;
    dispositionReason?: string;
  }[];
}

// ── Helpers ──

function getRemainingToReady(item: OrderLineItem): number {
  if (item.remainingDisposition === "cannot_fulfill") return 0;
  return item.quantityRemainingToReady ?? (item.quantity - (item.quantityReady || 0));
}

// ── Component ──

export function FulfillmentModal({
  open,
  onClose,
  onSubmit,
  lineItems,
  isSubmitting,
  initialDeclaration,
}: FulfillmentModalProps) {
  // Form state
  const [declaration, setDeclaration] = useState<DeliveryType>(initialDeclaration || "full");
  const [fulfillmentMethod, setFulfillmentMethod] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packingSlipNumber, setPackingSlipNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>({});
  const [dispositionReasons, setDispositionReasons] = useState<Record<string, string>>({});

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setDeclaration(initialDeclaration || "full");
      setFulfillmentMethod("");
      setExpectedDeliveryDate("");
      setCarrier("");
      setTrackingNumber("");
      setPackingSlipNumber("");
      setNotes("");
      setDispositions({});
      setExpectedDates({});
      setDispositionReasons({});

      // Initialize quantities
      const initQty: Record<string, number> = {};
      for (const item of lineItems) {
        const remaining = getRemainingToReady(item);
        initQty[item.purchaseOrderLineItemId] =
          (initialDeclaration || "full") === "full" ? remaining : 0;
      }
      setQuantities(initQty);
    }
  }, [open, lineItems, initialDeclaration]);

  // When declaration changes, reset quantities accordingly
  useEffect(() => {
    const initQty: Record<string, number> = {};
    for (const item of lineItems) {
      const remaining = getRemainingToReady(item);
      initQty[item.purchaseOrderLineItemId] = declaration === "full" ? remaining : 0;
    }
    setQuantities(initQty);
    setDispositions({});
    setExpectedDates({});
    setDispositionReasons({});
  }, [declaration, lineItems]);

  const showShippingFields = fulfillmentMethod === "carrier" || fulfillmentMethod === "vendor_truck";
  const isFull = declaration === "full";

  const fulfillableItems = lineItems.filter((item) => getRemainingToReady(item) > 0);
  const cancelledItems = lineItems.filter((item) => item.remainingDisposition === "cannot_fulfill");

  const handleSubmit = () => {
    const result: FulfillmentFormData = {
      declaration,
      fulfillmentMethod,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      carrier: carrier || undefined,
      trackingNumber: trackingNumber || undefined,
      packingSlipNumber: packingSlipNumber || undefined,
      notes: notes || undefined,
      lineItems: lineItems.map((item) => {
        const remaining = getRemainingToReady(item);
        const rawQty = quantities[item.purchaseOrderLineItemId];
        const qty = isFull ? remaining : (typeof rawQty === "number" ? rawQty : 0);
        const disp = dispositions[item.purchaseOrderLineItemId];
        const date = expectedDates[item.purchaseOrderLineItemId];
        const reason = dispositionReasons[item.purchaseOrderLineItemId];
        return {
          purchaseOrderLineItemId: item.purchaseOrderLineItemId,
          quantityReady: qty,
          ...(qty < remaining && disp ? { remainingDisposition: disp } : {}),
          ...(qty < remaining && disp === "backordered" && date ? { expectedReadyDate: date } : {}),
          ...(qty < remaining && disp && reason ? { dispositionReason: reason } : {}),
        };
      }),
    };
    onSubmit(result);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <Package className="h-5 w-5 text-primary" />
            <DialogTitle>Declare fulfillment</DialogTitle>
          </div>
          <DialogDescription>
            Report what is ready now and what will happen to every remaining item.
          </DialogDescription>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── Method Row ── */}
          <div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Fulfillment method</Label>
              <Select value={fulfillmentMethod} onValueChange={setFulfillmentMethod}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Select a method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carrier">Third-party carrier</SelectItem>
                  <SelectItem value="vendor_truck">Vendor truck</SelectItem>
                  <SelectItem value="digital">Digital (License, Asset)</SelectItem>
                  <SelectItem value="service">Service (Hours)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Shipping fields — shown conditionally */}
          {showShippingFields && (
            <div className="mt-4 p-4 rounded-xl border border-border bg-muted/20 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Expected delivery date</Label>
                  <DatePicker
                    date={expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined}
                    onSelect={(d) => setExpectedDeliveryDate(d ? format(d, "yyyy-MM-dd") : "")}
                    className="h-10 bg-white w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Carrier</Label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. FedEx, DHL"
                    className="h-10 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Tracking number</Label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. 1Z999AA1..."
                    className="h-10 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Packing slip number (optional)</Label>
                  <input
                    type="text"
                    value={packingSlipNumber}
                    onChange={(e) => setPackingSlipNumber(e.target.value)}
                    placeholder="Optional"
                    className="h-10 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

          {/* ── Outstanding Items ── */}
          <div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border">
                <p className="text-sm font-semibold">Outstanding items</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quantity ready is the amount included in this event, not a running total.
                </p>
              </div>
              <div className="divide-y divide-border">
                {fulfillableItems.map((item) => {
                  const remaining = getRemainingToReady(item);
                  const alreadyReady = item.quantityReady || 0;
                  const rawQty = quantities[item.purchaseOrderLineItemId];
                  const qty = rawQty !== undefined ? rawQty : 0;
                  const isPartialLine = !isFull && (qty === "" || qty < remaining) && (qty === "" || qty >= 0);
                  const disp = dispositions[item.purchaseOrderLineItemId];
                  const reason = dispositionReasons[item.purchaseOrderLineItemId] || "";

                  return (
                    <div key={item.purchaseOrderLineItemId} className="px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {alreadyReady} already fulfilled
                          </p>
                        </div>
                        <div className="text-right shrink-0 self-center">
                          <div className="flex items-center justify-end gap-1.5">
                            {isFull ? (
                              <div className="h-9 w-16 flex items-center justify-center text-sm font-medium bg-muted/30 rounded-lg border border-border">
                                {remaining}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                value={qty}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const valStr = e.target.value;
                                  if (valStr === '') {
                                    setQuantities((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: "" }));
                                    return;
                                  }
                                  const parsed = parseInt(valStr);
                                  if (!isNaN(parsed)) {
                                    const val = Math.max(0, Math.min(parsed, remaining));
                                    setQuantities((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: val }));
                                  }
                                }}
                                className="h-9 w-16 text-sm text-center border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            )}
                            <span className="text-sm text-muted-foreground whitespace-nowrap">/ {remaining} remaining</span>
                          </div>
                        </div>
                      </div>

                      {/* Disposition row — shown when partial and qty < remaining */}
                      {isPartialLine && (qty === "" || qty < remaining) && (
                        <div className="pt-2 border-t border-border/40 mt-3 space-y-4">
                          <div className="flex items-start gap-4">
                            <div className="space-y-2 flex-1">
                              <Label className="text-xs font-semibold text-amber-700">Missing {remaining - (typeof qty === "number" ? qty : 0)} Units Disposition</Label>
                              <Select
                                value={disp || ""}
                                onValueChange={(val) => setDispositions((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: val }))}
                              >
                                <SelectTrigger className="h-9 text-sm bg-white">
                                  <SelectValue placeholder="Select what happens next..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="backordered">Backordered (Shipping later)</SelectItem>
                                  <SelectItem value="cannot_fulfill">Cannot Fulfill (Cancel remaining)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {disp === "backordered" && (
                              <div className="space-y-2 flex-1">
                                <Label className="text-xs font-semibold text-blue-700">Expected ready date</Label>
                                <DatePicker
                                  date={expectedDates[item.purchaseOrderLineItemId] ? new Date(expectedDates[item.purchaseOrderLineItemId]) : undefined}
                                  onSelect={(d) => setExpectedDates((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: d ? format(d, "yyyy-MM-dd") : "" }))}
                                  className="h-9 text-sm w-full bg-white"
                                />
                              </div>
                            )}
                          </div>

                          {disp && (
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold text-amber-700">
                                Reason for {disp === "backordered" ? "backorder" : "cancellation"} <span className="text-muted-foreground font-normal">(optional)</span>
                              </Label>
                              <input
                                type="text"
                                value={reason}
                                onChange={(e) => setDispositionReasons((prev) => ({ ...prev, [item.purchaseOrderLineItemId]: e.target.value }))}
                                placeholder={disp === "backordered" ? "e.g., Supply chain delay, waiting on materials" : "e.g., Item discontinued, completely out of stock"}
                                className="h-9 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Cancelled items — non-editable */}
                {cancelledItems.map((item) => (
                  <div key={item.purchaseOrderLineItemId} className="px-4 py-4 flex items-center justify-between opacity-60">
                    <div>
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Cannot fulfill</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-md border border-red-100">
                      Cancelled
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <Label className="text-sm font-semibold">Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for this shipment..."
              rows={3}
              className="mt-1.5 w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border bg-gray-50/50 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
            Submit fulfillment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
