"use client";

import { FormEvent, useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  CreateFulfillmentPayload,
  FulfillmentDeclaration,
  FulfillmentMethod,
  Order,
  RemainingDisposition,
} from "@/lib/types";
import { toast } from "sonner";

interface FulfillmentModalProps {
  open: boolean;
  order: Order;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateFulfillmentPayload) => void;
}

interface LineDraft {
  quantityReady: number;
  remainingDisposition: RemainingDisposition | "";
  expectedReadyDate: string;
}

const today = new Date().toISOString().slice(0, 10);

function newFulfillmentReference() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `FUL-${crypto.randomUUID()}`;
  }
  return `FUL-${Date.now()}`;
}

export function FulfillmentModal({
  open,
  order,
  isPending,
  onClose,
  onSubmit,
}: FulfillmentModalProps) {
  const outstandingLines = useMemo(
    () =>
      order.lineItems
        .map((line) => ({
          ...line,
          remaining:
            line.quantityRemainingToReady ??
            Math.max(
              line.quantity - (line.quantityReady ?? line.quantityShipped ?? 0),
              0
            ),
        }))
        .filter((line) => line.remaining > 0),
    [order.lineItems]
  );
  const [fulfillmentReference] = useState(newFulfillmentReference);
  const [declaration, setDeclaration] = useState<FulfillmentDeclaration | "">("");
  const [method, setMethod] = useState<FulfillmentMethod | "">("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packingSlipNumber, setPackingSlipNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      outstandingLines.map((line) => [
        line.purchaseOrderLineItemId,
        {
          quantityReady: 0,
          remainingDisposition: "",
          expectedReadyDate: "",
        },
      ])
    )
  );

  const updateDeclaration = (value: FulfillmentDeclaration) => {
    setDeclaration(value);
    setLines(
      Object.fromEntries(
        outstandingLines.map((line) => [
          line.purchaseOrderLineItemId,
          {
            quantityReady: value === "full" ? line.remaining : 0,
            remainingDisposition: "",
            expectedReadyDate: "",
          },
        ])
      )
    );
  };

  const updateLine = (lineId: string, patch: Partial<LineDraft>) => {
    setLines((current) => ({
      ...current,
      [lineId]: { ...current[lineId], ...patch },
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!declaration || !method) {
      toast.error("Select a fulfillment declaration and method");
      return;
    }

    const hasPositiveQuantity = outstandingLines.some(
      (line) => (lines[line.purchaseOrderLineItemId]?.quantityReady ?? 0) > 0
    );
    if (!hasPositiveQuantity) {
      toast.error("Enter a ready quantity for at least one item");
      return;
    }

    const lineItems = outstandingLines.map((line) => {
      const draft = lines[line.purchaseOrderLineItemId];
      const quantityReady = Math.max(
        0,
        Math.min(Number(draft?.quantityReady ?? 0), line.remaining)
      );
      const remainingAfterEvent = line.remaining - quantityReady;

      if (declaration === "full" && remainingAfterEvent !== 0) {
        throw new Error(`Enter the complete remaining quantity for ${line.name}`);
      }
      if (remainingAfterEvent > 0 && !draft?.remainingDisposition) {
        throw new Error(`Select what happens to the remaining ${line.name} quantity`);
      }
      if (
        remainingAfterEvent > 0 &&
        draft.remainingDisposition === "backordered" &&
        !draft.expectedReadyDate
      ) {
        throw new Error(`Enter an expected ready date for ${line.name}`);
      }

      return {
        purchaseOrderLineItemId: line.purchaseOrderLineItemId,
        quantityReady,
        ...(remainingAfterEvent > 0 && draft.remainingDisposition
          ? { remainingDisposition: draft.remainingDisposition }
          : {}),
        ...(remainingAfterEvent > 0 &&
        draft.remainingDisposition === "backordered" &&
        draft.expectedReadyDate
          ? { expectedReadyDate: draft.expectedReadyDate }
          : {}),
      };
    });

    if (
      declaration === "partial" &&
      outstandingLines.every(
        (line) =>
          (lines[line.purchaseOrderLineItemId]?.quantityReady ?? 0) >= line.remaining
      )
    ) {
      toast.error("Choose Full when this event covers every remaining quantity");
      return;
    }
    if (method === "carrier" && (!carrier.trim() || !trackingNumber.trim())) {
      toast.error("Carrier and tracking number are required");
      return;
    }
    if ((method === "carrier" || method === "vendor_truck") && !expectedDeliveryDate) {
      toast.error("Expected delivery date is required for physical fulfillment");
      return;
    }

    onSubmit({
      fulfillmentReference,
      declaration,
      fulfillmentMethod: method,
      ...(physical && expectedDeliveryDate ? { expectedDeliveryDate } : {}),
      ...(method === "carrier" && carrier.trim() ? { carrier: carrier.trim() } : {}),
      ...(method === "carrier" && trackingNumber.trim()
        ? { trackingNumber: trackingNumber.trim() }
        : {}),
      ...(physical && packingSlipNumber.trim()
        ? { packingSlipNumber: packingSlipNumber.trim() }
        : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      lineItems,
    });
  };

  const submitSafely = (event: FormEvent) => {
    try {
      handleSubmit(event);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the fulfillment details");
    }
  };

  const physical = method === "carrier" || method === "vendor_truck";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submitSafely} className="space-y-5">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              Declare fulfillment
            </DialogTitle>
            <DialogDescription className="mt-1">
              Report what is ready now and what will happen to every remaining item.
            </DialogDescription>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fulfillment declaration</Label>
              <Select value={declaration} onValueChange={updateDeclaration}>
                <SelectTrigger>
                  <SelectValue placeholder="Select full or partial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full — completes all remaining quantities</SelectItem>
                  <SelectItem value="partial">Partial — quantities will remain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fulfillment method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as FulfillmentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carrier">Third-party carrier</SelectItem>
                  <SelectItem value="vendor_truck">Vendor delivery</SelectItem>
                  <SelectItem value="digital">Digital goods</SelectItem>
                  <SelectItem value="service">Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {physical && (
            <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="expected-delivery-date">Expected delivery date</Label>
                <Input
                  id="expected-delivery-date"
                  type="date"
                  min={today}
                  value={expectedDeliveryDate}
                  onChange={(event) => setExpectedDeliveryDate(event.target.value)}
                />
              </div>
              {method === "carrier" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="carrier">Carrier</Label>
                    <Input id="carrier" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tracking-number">Tracking number</Label>
                    <Input
                      id="tracking-number"
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="packing-slip">Packing slip number (optional)</Label>
                <Input
                  id="packing-slip"
                  value={packingSlipNumber}
                  onChange={(event) => setPackingSlipNumber(event.target.value)}
                />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold">Outstanding items</p>
              <p className="text-xs text-muted-foreground">
                Quantity ready is the amount included in this event, not a running total.
              </p>
            </div>
            <div className="divide-y divide-border">
              {outstandingLines.map((line) => {
                const draft = lines[line.purchaseOrderLineItemId];
                const remainingAfter = Math.max(
                  line.remaining - (draft?.quantityReady ?? 0),
                  0
                );
                return (
                  <div key={line.purchaseOrderLineItemId} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{line.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.remaining} remaining · {line.quantityReady ?? 0} already ready
                        </p>
                      </div>
                      <div className="w-28 space-y-1">
                        <Label htmlFor={`quantity-${line.purchaseOrderLineItemId}`} className="text-xs">
                          Ready now
                        </Label>
                        <Input
                          id={`quantity-${line.purchaseOrderLineItemId}`}
                          type="number"
                          min={0}
                          max={line.remaining}
                          step="0.01"
                          readOnly={declaration === "full"}
                          value={draft?.quantityReady ?? 0}
                          onChange={(event) =>
                            updateLine(line.purchaseOrderLineItemId, {
                              quantityReady: Math.max(
                                0,
                                Math.min(Number(event.target.value), line.remaining)
                              ),
                            })
                          }
                        />
                      </div>
                    </div>

                    {declaration === "partial" && remainingAfter > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Remaining quantity</Label>
                          <Select
                            value={draft?.remainingDisposition || ""}
                            onValueChange={(value) =>
                              updateLine(line.purchaseOrderLineItemId, {
                                remainingDisposition: value as RemainingDisposition,
                                expectedReadyDate:
                                  value === "cannot_fulfill"
                                    ? ""
                                    : draft?.expectedReadyDate || "",
                              })
                            }
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select what happens next" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="backordered">Backordered — expected later</SelectItem>
                              <SelectItem value="cannot_fulfill">Cannot fulfill remainder</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {draft?.remainingDisposition === "backordered" && (
                          <div className="space-y-1.5">
                            <Label htmlFor={`ready-date-${line.purchaseOrderLineItemId}`} className="text-xs">
                              Expected ready date
                            </Label>
                            <Input
                              id={`ready-date-${line.purchaseOrderLineItemId}`}
                              type="date"
                              min={today}
                              value={draft.expectedReadyDate}
                              onChange={(event) =>
                                updateLine(line.purchaseOrderLineItemId, {
                                  expectedReadyDate: event.target.value,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fulfillment-notes">Notes (optional)</Label>
            <textarea
              id="fulfillment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isPending} disabled={!outstandingLines.length}>
              Submit fulfillment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
