"use client";

import React, { useState, useEffect } from "react";
import {
  Package,
  Truck,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Laptop,
  Wrench,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  XCircle,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn, formatQtyWithUom, formatUomLabel } from "@/lib/utils";
import { format } from "date-fns";
import type { OrderLineItem, DeliveryType } from "@/lib/types";

// ── Types ──

interface FulfillmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FulfillmentFormData) => void;
  lineItems: OrderLineItem[];
  isSubmitting: boolean;
  /** Pre-selected declaration from the dropdown ("full" or "partial") */
  initialDeclaration?: DeliveryType;
  /** Existing fulfillment/waybill references on this PO so we can prevent duplicate 409 conflicts */
  existingReferences?: string[];
  /** 1-based shipment number (e.g. 1 for Shipment #1, 2 for Shipment #2) */
  nextShipmentNumber?: number;
}

export interface FulfillmentFormData {
  declaration: DeliveryType;
  fulfillmentMethod: string;
  /** When true on physical shipments, immediately dispatches the shipment after creating the fulfillment record */
  dispatchNow?: boolean;
  expectedDeliveryDate?: string;
  fulfillmentReference?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  notes?: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    quantityReady: number;
    remainingDisposition?: string;
    expectedReadyDate?: string;
    reason?: string;
    dispositionReason?: string;
  }[];
}

// ── Helpers ──

function getRemainingToReady(item: OrderLineItem): number {
  if (item.remainingDisposition === "cannot_fulfill") return 0;
  return (
    item.quantityRemainingToReady ??
    item.quantityOutstanding ??
    Math.max(0, item.quantity - (item.quantityReady || 0) - (item.quantityForfeited || 0))
  );
}

const DEFAULT_BACKORDER_REASON = "Delivering in batches";
const DEFAULT_CANCEL_REASON = "Stock shortage";

const BACKORDER_QUICK_REASONS = [
  "Delivering in batches",
  "Awaiting restock",
  "In production",
];

const CANCEL_QUICK_REASONS = [
  "Stock shortage",
  "Item discontinued",
  "Supplier unavailable",
];

const DELIVERY_METHODS = [
  {
    id: "carrier",
    title: "Courier / Carrier",
    subtitle: "DHL, FedEx, GIG, etc.",
    icon: Truck,
  },
  {
    id: "vendor_truck",
    title: "Own Vehicle / Rider",
    subtitle: "Company truck or van",
    icon: Package,
  },
  {
    id: "digital",
    title: "Digital Delivery",
    subtitle: "License or online file",
    icon: Laptop,
  },
  {
    id: "service",
    title: "Service Completed",
    subtitle: "Milestone finished",
    icon: Wrench,
  },
] as const;

/** Custom accessible radio circle matching Checkbox.tsx (zero native browser styles) */
function CustomRadioIndicator({
  checked,
  tone = "teal",
}: {
  checked: boolean;
  tone?: "teal" | "danger";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-4 w-4 rounded-full border flex items-center justify-center transition-all duration-150 shrink-0",
        checked
          ? tone === "danger"
            ? "border-2 border-red-600 bg-red-600"
            : "border-2 border-[#00b29a] bg-[#00b29a]"
          : "border-border bg-white"
      )}
    >
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
  );
}

// ── Component ──

export function FulfillmentModal({
  open,
  onClose,
  onSubmit,
  lineItems,
  isSubmitting,
  initialDeclaration,
  existingReferences = [],
  nextShipmentNumber = 1,
}: FulfillmentModalProps) {
  const declaration: DeliveryType = initialDeclaration || "full";
  const isFull = declaration === "full";

  // For "full" fulfillment, quantities are already known (all remaining units), so we go straight to Delivery Details!
  // For "partial" fulfillment, Step 1 = Quantities & Remaining Units, Step 2 = Delivery & Dispatch.
  const [step, setStep] = useState<1 | 2>(isFull ? 2 : 1);

  const [fulfillmentMethod, setFulfillmentMethod] = useState("carrier");
  const [dispatchNow, setDispatchNow] = useState(true);
  const [showOptionalPaperwork, setShowOptionalPaperwork] = useState(false);

  const [fulfillmentReference, setFulfillmentReference] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packingSlipNumber, setPackingSlipNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Per-item quantities & remainder settings (for partial mode)
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>({});
  const [dispositionReasons, setDispositionReasons] = useState<Record<string, string>>({});

  // Multi-item shared remainder mode: when 2+ items have remaining units, let vendor apply one decision to all or customize per item
  const [useSharedRemainder, setUseSharedRemainder] = useState(true);
  const [sharedDisposition, setSharedDisposition] = useState<string>("");
  const [sharedExpectedDate, setSharedExpectedDate] = useState<string>("");
  const [sharedReason, setSharedReason] = useState<string>("");

  const [validationError, setValidationError] = useState<string | null>(null);

  const fulfillableItems = lineItems.filter((item) => getRemainingToReady(item) > 0);
  const cancelledItems = lineItems.filter((item) => item.remainingDisposition === "cannot_fulfill");
  const totalRemainingUnits = fulfillableItems.reduce((sum, item) => sum + getRemainingToReady(item), 0);
  const isMultiItem = fulfillableItems.length > 1;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      const mode = initialDeclaration || "full";
      setStep(mode === "full" ? 2 : 1);
      setFulfillmentMethod("carrier");
      setDispatchNow(true);
      setShowOptionalPaperwork(false);
      setFulfillmentReference("");
      setExpectedDeliveryDate("");
      setCarrier("");
      setTrackingNumber("");
      setPackingSlipNumber("");
      setNotes("");
      setValidationError(null);

      setUseSharedRemainder(true);
      setSharedDisposition("backordered");
      setSharedExpectedDate("");
      setSharedReason("");

      const initSelected: Record<string, boolean> = {};
      const initQty: Record<string, number | ""> = {};
      const initDisp: Record<string, string> = {};

      for (const item of lineItems) {
        const remaining = getRemainingToReady(item);
        if (remaining > 0) {
          const id = item.purchaseOrderLineItemId;
          // In Full mode, all items are selected with their full remaining quantity.
          // In Partial mode, start at 0 (unselected) so the vendor simply checks or enters quantities for the items they are fulfilling now!
          initSelected[id] = mode === "full";
          initQty[id] = mode === "full" ? remaining : 0;
          initDisp[id] = "backordered";
        }
      }
      setSelectedItems(initSelected);
      setQuantities(initQty);
      setDispositions(initDisp);
      setExpectedDates({});
      setDispositionReasons({});
    }
  }, [open, initialDeclaration, lineItems]);

  const isPhysical = fulfillmentMethod === "carrier" || fulfillmentMethod === "vendor_truck";

  const getEffectiveItemQty = (item: OrderLineItem): number => {
    const remaining = getRemainingToReady(item);
    if (isFull) return remaining;
    const raw = quantities[item.purchaseOrderLineItemId];
    return typeof raw === "number" ? Math.max(0, Math.min(raw, remaining)) : 0;
  };

  const totalDeliveringNow = fulfillableItems.reduce(
    (sum, item) => sum + getEffectiveItemQty(item),
    0
  );

  const selectedItemCount = fulfillableItems.filter(
    (item) => getEffectiveItemQty(item) > 0
  ).length;

  // Only items that are ACTUALLY included in this fulfillment (qty > 0) and have a partial leftover (qty < remaining)
  // require a remainder decision (backorder vs forfeit). Unchecked items (qty === 0) stay open on the PO untouched!
  const partialItemsWithLeftover = fulfillableItems.filter((item) => {
    if (isFull) return false;
    const remaining = getRemainingToReady(item);
    const qty = getEffectiveItemQty(item);
    return qty > 0 && qty < remaining;
  });

  // Validate Step 1 (Partial Quantities & Remainder)
  const validateStep1 = (): string | null => {
    if (totalDeliveringNow <= 0) {
      return "Enter a quantity greater than 0 for at least one item you are fulfilling now.";
    }

    if (!isFull && partialItemsWithLeftover.length > 0) {
      const useShared = useSharedRemainder || partialItemsWithLeftover.length === 1;
      if (useShared) {
        if (!sharedDisposition) {
          return "Select what happens to the remaining quantities on your selected item(s).";
        }
        if (sharedDisposition === "backordered" && !sharedExpectedDate) {
          return "Select the expected ready date for the remaining backordered items.";
        }
        if (!sharedReason.trim()) {
          return "Enter or select a short note for the remaining items.";
        }
      } else {
        for (const item of partialItemsWithLeftover) {
          const id = item.purchaseOrderLineItemId;
          const remaining = getRemainingToReady(item);
          const leftOver = remaining - getEffectiveItemQty(item);
          const disp = dispositions[id];
          if (!disp) {
            return `Select what happens to the remaining ${formatQtyWithUom(leftOver, item.unitOfMeasure)} of "${item.name}".`;
          }
          if (disp === "backordered" && !expectedDates[id]) {
            return `Select when the remaining ${formatQtyWithUom(leftOver, item.unitOfMeasure)} of "${item.name}" will be ready.`;
          }
          if (!dispositionReasons[id]?.trim()) {
            return `Enter a short note for the remaining "${item.name}" items.`;
          }
        }
      }
    }
    return null;
  };

  const normalizedExistingRefs = new Set(
    existingReferences
      .map((r) => r?.trim().toLowerCase())
      .filter((r): r is string => !!r)
  );
  const trimmedRef = fulfillmentReference.trim();
  const isDuplicateReference =
    trimmedRef.length > 0 && normalizedExistingRefs.has(trimmedRef.toLowerCase());

  const generateUniqueWaybillNumber = () => {
    const datePart = format(new Date(), "yyyyMMdd");
    const randPart = Math.floor(100 + Math.random() * 900);
    const candidate = `WB-${datePart}-${String(nextShipmentNumber).padStart(2, "0")}-${randPart}`;
    setValidationError(null);
    setFulfillmentReference(candidate);
  };

  // Validate Step 2 (Delivery & Dispatch)
  const validateStep2 = (): string | null => {
    if (!fulfillmentMethod) {
      return "Please choose how this delivery is being sent.";
    }
    if (fulfillmentMethod === "carrier") {
      if (!carrier.trim()) {
        return "Please enter the courier or carrier name (e.g., DHL, FedEx, GIG).";
      }
      if (!expectedDeliveryDate) {
        return "Please select the expected arrival date.";
      }
    }
    if (fulfillmentMethod === "vendor_truck") {
      if (!expectedDeliveryDate) {
        return "Please select the expected arrival date.";
      }
    }
    if (isDuplicateReference) {
      return `The reference number "${trimmedRef}" was already used on an earlier shipment for this order. Each delivery needs its own unique Waybill / Reference # (or leave it blank to auto-generate).`;
    }
    return null;
  };

  const handleContinueToStep2 = () => {
    const err = validateStep1();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setStep(2);
  };

  const handleFinalSubmit = () => {
    const err = validateStep2();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);

    let finalExpectedDeliveryDate = expectedDeliveryDate || undefined;
    let finalCarrier = carrier || undefined;
    let finalTrackingNumber = trackingNumber || undefined;
    let finalPackingSlipNumber = packingSlipNumber || undefined;

    if (fulfillmentMethod === "vendor_truck") {
      finalCarrier = undefined;
      finalTrackingNumber = undefined;
    } else if (fulfillmentMethod === "digital" || fulfillmentMethod === "service") {
      finalExpectedDeliveryDate = undefined;
      finalCarrier = undefined;
      finalTrackingNumber = undefined;
      finalPackingSlipNumber = undefined;
    }

    const useShared = useSharedRemainder || partialItemsWithLeftover.length === 1;

    // Only include items that are actually being fulfilled in this fulfillment (qtyReady > 0).
    // Unselected items (qtyReady === 0) remain open on the PO for future fulfillments.
    const itemsToSubmit = fulfillableItems
      .filter((item) => getEffectiveItemQty(item) > 0)
      .map((item) => {
        const id = item.purchaseOrderLineItemId;
        const remaining = getRemainingToReady(item);
        const qtyReady = getEffectiveItemQty(item);

        let remainingDisposition: string | undefined;
        let expectedReadyDate: string | undefined;
        let dispositionReason: string | undefined;
        let reason: string | undefined;

        if (!isFull && qtyReady < remaining) {
          remainingDisposition = (useShared ? sharedDisposition : dispositions[id]) || undefined;
          if (remainingDisposition === "backordered") {
            expectedReadyDate = (useShared ? sharedExpectedDate : expectedDates[id]) || undefined;
          }
          const trimmedReason = (useShared ? sharedReason : dispositionReasons[id])?.trim();
          reason = trimmedReason || undefined;
          dispositionReason = trimmedReason || undefined;
        }

        return {
          purchaseOrderLineItemId: id,
          quantityReady: qtyReady,
          remainingDisposition,
          expectedReadyDate,
          reason,
          dispositionReason,
        };
      });

    const effectiveDeclaration: DeliveryType =
      totalDeliveringNow >= totalRemainingUnits ? "full" : "partial";

    onSubmit({
      declaration: effectiveDeclaration,
      fulfillmentMethod,
      dispatchNow: isPhysical ? dispatchNow : undefined,
      fulfillmentReference: fulfillmentReference.trim() || undefined,
      expectedDeliveryDate: finalExpectedDeliveryDate,
      carrier: finalCarrier?.trim() || undefined,
      trackingNumber: finalTrackingNumber?.trim() || undefined,
      packingSlipNumber: finalPackingSlipNumber?.trim() || undefined,
      notes: notes.trim() || undefined,
      lineItems: itemsToSubmit,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        size="lg"
        className="max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border shadow-2xl"
      >
        {/* ── Clean, Compact Header (No Stacked Tab Bars) ── */}
        <div className="px-6 pt-5 pb-4 border-b border-border bg-white shrink-0">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#f0faf8] border border-[#cbf0eb] text-[#00b29a] flex items-center justify-center shrink-0">
                {step === 1 ? <Package className="h-4.5 w-4.5" /> : <Truck className="h-4.5 w-4.5" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base font-bold text-foreground">
                    {isFull
                      ? "Declare Full Fulfillment"
                      : step === 1
                      ? "Partial Fulfillment — Quantities"
                      : "Partial Fulfillment — Delivery & Dispatch"}
                  </DialogTitle>
                  {!isFull && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0faf8] text-[#087f70] border border-[#cbf0eb]">
                      Step {step} of 2
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isFull
                    ? `Fulfilling all ${totalRemainingUnits} remaining unit${totalRemainingUnits === 1 ? "" : "s"} across ${fulfillableItems.length} item${fulfillableItems.length === 1 ? "" : "s"}.`
                    : step === 1
                    ? "Select the items and quantities you are fulfilling now."
                    : `Fulfilling ${totalDeliveringNow} of ${totalRemainingUnits} remaining units (${selectedItemCount} item${selectedItemCount === 1 ? "" : "s"}).`}
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50/40">
          {/* Inline Validation Banner */}
          {validationError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{validationError}</div>
            </div>
          )}

          {step === 1 && !isFull ? (
            /* ════════════════════════════════════════════════════════════
               STEP 1 (PARTIAL MODE ONLY): ITEMS, QUANTITIES & REMAINDER
               ════════════════════════════════════════════════════════════ */
            <div className="space-y-4">
              {/* ── SECTION 1: CHOOSE ITEMS & QUANTITIES FOR THIS FULFILLMENT ── */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-[#00b29a] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      What are you fulfilling now?
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-2.5 py-0.5 rounded-full border",
                        totalDeliveringNow > 0
                          ? "bg-[#f0faf8] text-[#087f70] border-[#cbf0eb]"
                          : "bg-slate-100 text-muted-foreground border-border"
                      )}
                    >
                      Fulfilling now: <strong>{totalDeliveringNow}</strong> of {totalRemainingUnits} ({selectedItemCount} of {fulfillableItems.length} item{fulfillableItems.length === 1 ? "" : "s"})
                    </span>
                  </div>
                </div>

                {/* Compact, Scannable Line Items List (Never expands huge forms inside item rows) */}
                <div className="space-y-2">
                  {fulfillableItems.map((item) => {
                    const id = item.purchaseOrderLineItemId;
                    const remaining = getRemainingToReady(item);
                    const alreadySent = item.quantityReady || 0;
                    const rawQty = quantities[id];
                    const numericQty = getEffectiveItemQty(item);
                    const isSending = numericQty > 0;
                    const isSendingAll = numericQty === remaining;
                    const leftOver = Math.max(0, remaining - numericQty);

                    const setItemQty = (nextVal: number) => {
                      const clamped = Math.max(0, Math.min(nextVal, remaining));
                      setValidationError(null);
                      setSelectedItems((prev) => ({ ...prev, [id]: clamped > 0 }));
                      setQuantities((prev) => ({
                        ...prev,
                        [id]: clamped,
                      }));
                    };

                    return (
                      <div
                        key={id}
                        className={cn(
                          "rounded-xl border px-3.5 py-3 transition-all",
                          isSending
                            ? "border-[#00b29a] bg-[#f0faf8]/40 shadow-2xs"
                            : "border-border bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Left: Checkbox + Item Name + Live Plain-English Status */}
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="pt-0.5">
                              <Checkbox
                                checked={isSending}
                                onCheckedChange={(checked) => {
                                  // Checking an item fills all remaining units (1-click full line selection);
                                  // unchecking resets it to 0.
                                  setItemQty(checked ? remaining : 0);
                                }}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-foreground">{item.name}</p>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-border">
                                  {formatQtyWithUom(remaining, item.unitOfMeasure)} remaining
                                </span>
                                {alreadySent > 0 && (
                                  <span className="text-[11px] text-muted-foreground">
                                    ({formatQtyWithUom(alreadySent, item.unitOfMeasure)} already fulfilled)
                                  </span>
                                )}
                              </div>

                              {/* Clear 1-line explanation of what will happen to this item */}
                              <p className="text-[11px] mt-0.5">
                                {isSendingAll ? (
                                  <span className="font-semibold text-[#087f70]">
                                    ✓ Fulfilling all {formatQtyWithUom(remaining, item.unitOfMeasure)} now
                                  </span>
                                ) : isSending ? (
                                  <span className="font-medium text-foreground">
                                    <strong className="text-[#087f70]">
                                      Fulfilling {formatQtyWithUom(numericQty, item.unitOfMeasure)} now
                                    </strong>{" "}
                                    ·{" "}
                                    <span className="text-amber-700 font-semibold">
                                      {formatQtyWithUom(leftOver, item.unitOfMeasure)} will remain
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Not included in this fulfillment · Will remain open for later
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Right: Always-accessible Stepper + 1-Click All Button */}
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            {!isSendingAll && (
                              <button
                                type="button"
                                onClick={() => setItemQty(remaining)}
                                className="cursor-pointer text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border bg-white text-foreground hover:border-[#00b29a] hover:bg-[#f0faf8] hover:text-[#087f70] shadow-2xs transition-all"
                                title={`Fulfill all ${formatQtyWithUom(remaining, item.unitOfMeasure)}`}
                              >
                                All {remaining}
                              </button>
                            )}
                            <div
                              className={cn(
                                "flex items-center rounded-xl border p-0.5 transition-colors",
                                isSending
                                  ? "border-[#00b29a] bg-white"
                                  : "border-border bg-slate-50"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setItemQty(numericQty - 1)}
                                disabled={numericQty <= 0}
                                className="cursor-pointer disabled:cursor-not-allowed h-7 w-7 rounded-lg flex items-center justify-center text-foreground hover:bg-slate-100 disabled:opacity-35 transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                value={rawQty === "" ? "" : numericQty}
                                onFocus={(e) => e.target.select()}
                                onBlur={() => {
                                  if (quantities[id] === "") {
                                    setItemQty(0);
                                  }
                                }}
                                onChange={(e) => {
                                  const valStr = e.target.value;
                                  setValidationError(null);
                                  if (valStr === "") {
                                    setSelectedItems((prev) => ({ ...prev, [id]: false }));
                                    setQuantities((prev) => ({
                                      ...prev,
                                      [id]: "",
                                    }));
                                    return;
                                  }
                                  const parsed = parseInt(valStr, 10);
                                  if (!isNaN(parsed)) {
                                    setItemQty(parsed);
                                  }
                                }}
                                className={cn(
                                  "h-7 w-14 text-center text-sm font-bold bg-white border-x border-border focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20",
                                  isSending ? "text-[#087f70]" : "text-muted-foreground"
                                )}
                              />
                              <button
                                type="button"
                                onClick={() => setItemQty(numericQty + 1)}
                                disabled={numericQty >= remaining}
                                className="cursor-pointer disabled:cursor-not-allowed h-7 w-7 rounded-lg flex items-center justify-center text-foreground hover:bg-slate-100 disabled:opacity-35 transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="text-xs text-muted-foreground font-medium min-w-[52px]">
                              / {formatQtyWithUom(remaining, item.unitOfMeasure)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {cancelledItems.map((item) => (
                    <div
                      key={item.purchaseOrderLineItemId}
                      className="rounded-xl border border-border bg-white/60 px-4 py-2.5 flex items-center justify-between opacity-60"
                    >
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Previously marked as cannot supply</p>
                      </div>
                      <span className="text-xs text-red-600 font-medium bg-red-50 px-2.5 py-1 rounded-md border border-red-100">
                        Cancelled
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── SECTION 2: WHAT HAPPENS TO THE REMAINING QUANTITIES ON SELECTED ITEMS? ── */}
              {totalDeliveringNow === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-white/70 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground">
                    Select an item or enter a quantity above to continue.
                  </p>
                </div>
              ) : partialItemsWithLeftover.length === 0 ? (
                <div className="rounded-xl border border-[#cbf0eb] bg-[#f0faf8] px-4 py-3 flex items-center gap-2.5 text-xs text-[#087f70]">
                  <CheckCircle2 className="h-4 w-4 text-[#00b29a] shrink-0" />
                  <span className="font-medium">
                    {totalDeliveringNow >= totalRemainingUnits
                      ? "You are fulfilling all remaining quantities on this order."
                      : "You are fulfilling the full quantity for your selected item(s). Unselected items on this order will stay open for your next fulfillment."}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-white p-4 space-y-3.5 shadow-2xs">
                  {/* Section 2 Header + Interactive Segmented Mode Toggle */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-[#00b29a] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <p className="text-xs font-bold text-foreground">
                          What happens to the remaining{" "}
                          {partialItemsWithLeftover.length === 1
                            ? `${formatQtyWithUom(
                                getRemainingToReady(partialItemsWithLeftover[0]) -
                                  getEffectiveItemQty(partialItemsWithLeftover[0]),
                                partialItemsWithLeftover[0].unitOfMeasure
                              )} of ${partialItemsWithLeftover[0].name}`
                            : `quantities across ${partialItemsWithLeftover.length} selected items`}
                          ?
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground pl-7">
                        Let the buyer know whether you will fulfill the remaining balance later or cancel it.
                      </p>
                    </div>

                    {partialItemsWithLeftover.length > 1 && (
                      <div
                        role="group"
                        aria-label="Remainder plan mode"
                        className="inline-flex items-center rounded-xl border border-border bg-slate-100 p-1 shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setValidationError(null);
                            setUseSharedRemainder(true);
                          }}
                          className={cn(
                            "cursor-pointer px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                            useSharedRemainder
                              ? "bg-white text-foreground shadow-xs border border-border/70"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          One plan for all ({partialItemsWithLeftover.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setValidationError(null);
                            if (useSharedRemainder) {
                              // Seed per-item state with current shared values so vendor only tweaks what differs
                              const seededDisp: Record<string, string> = { ...dispositions };
                              const seededDates: Record<string, string> = { ...expectedDates };
                              const seededReasons: Record<string, string> = { ...dispositionReasons };
                              for (const item of partialItemsWithLeftover) {
                                const id = item.purchaseOrderLineItemId;
                                if (!seededDisp[id]) seededDisp[id] = sharedDisposition || "backordered";
                                if (!seededDates[id] && sharedExpectedDate) seededDates[id] = sharedExpectedDate;
                                if (!seededReasons[id] && sharedReason) seededReasons[id] = sharedReason;
                              }
                              setDispositions(seededDisp);
                              setExpectedDates(seededDates);
                              setDispositionReasons(seededReasons);
                            }
                            setUseSharedRemainder(false);
                          }}
                          className={cn(
                            "cursor-pointer px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                            !useSharedRemainder
                              ? "bg-white text-foreground shadow-xs border border-border/70"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Customize per item
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Pills of Remaining Items (When 2+ selected items have leftover) */}
                  {partialItemsWithLeftover.length > 1 && useSharedRemainder && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-7">
                      {partialItemsWithLeftover.map((item) => {
                        const left = getRemainingToReady(item) - getEffectiveItemQty(item);
                        return (
                          <span
                            key={item.purchaseOrderLineItemId}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50/80 border border-amber-200/80 text-amber-900 font-medium"
                          >
                            {item.name}: <strong>{formatQtyWithUom(left, item.unitOfMeasure)} left</strong>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {useSharedRemainder || partialItemsWithLeftover.length === 1 ? (
                    /* ── UNIFIED REMAINDER PLAN (DEFAULT — FASTEST & SIMPLEST) ── */
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setValidationError(null);
                            setSharedDisposition("backordered");
                            if (CANCEL_QUICK_REASONS.includes(sharedReason)) {
                              setSharedReason("");
                            }
                          }}
                          className={cn(
                            "cursor-pointer flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all",
                            sharedDisposition === "backordered"
                              ? "border-[#00b29a] bg-[#f0faf8]/70 ring-1 ring-[#00b29a]/25"
                              : "border-border bg-slate-50/40 hover:bg-slate-50"
                          )}
                        >
                          <div className="pt-0.5">
                            <CustomRadioIndicator
                              checked={sharedDisposition === "backordered"}
                              tone="teal"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-[#00b29a]" />
                              Fulfill the rest later (Backorder)
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Keep the remaining balance open for your next fulfillment
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setValidationError(null);
                            setSharedDisposition("cannot_fulfill");
                            if (BACKORDER_QUICK_REASONS.includes(sharedReason)) {
                              setSharedReason("");
                            }
                          }}
                          className={cn(
                            "cursor-pointer flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all",
                            sharedDisposition === "cannot_fulfill"
                              ? "border-red-400 bg-red-50/50 ring-1 ring-red-200"
                              : "border-border bg-slate-50/40 hover:bg-slate-50"
                          )}
                        >
                          <div className="pt-0.5">
                            <CustomRadioIndicator
                              checked={sharedDisposition === "cannot_fulfill"}
                              tone="danger"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <XCircle className="h-3.5 w-3.5 text-red-600" />
                              Cancel remaining balance (Forfeit)
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Permanently cancel the remaining quantity you cannot supply
                            </p>
                          </div>
                        </button>
                      </div>

                      {sharedDisposition && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start pt-1">
                          {sharedDisposition === "backordered" && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-h-[20px]">
                                <Label className="text-xs font-semibold text-foreground whitespace-nowrap" required>
                                  Expected ready date
                                </Label>
                                {!sharedExpectedDate && (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                                    Required
                                  </span>
                                )}
                              </div>
                              <DatePicker
                                date={sharedExpectedDate ? new Date(sharedExpectedDate) : undefined}
                                onSelect={(d) => {
                                  setValidationError(null);
                                  setSharedExpectedDate(d ? format(d, "yyyy-MM-dd") : "");
                                }}
                                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                className={cn(
                                  "h-9 text-sm w-full bg-white",
                                  !sharedExpectedDate && "border-amber-300"
                                )}
                              />
                            </div>
                          )}

                          <div
                            className={cn(
                              "space-y-1.5",
                              sharedDisposition !== "backordered" && "sm:col-span-2"
                            )}
                          >
                            <div className="flex items-center min-h-[20px]">
                              <Label className="text-xs font-semibold text-foreground whitespace-nowrap" required>
                                Reason / note for buyer
                              </Label>
                            </div>
                            <input
                              type="text"
                              value={sharedReason}
                              onChange={(e) => {
                                setValidationError(null);
                                setSharedReason(e.target.value);
                              }}
                              placeholder={
                                sharedDisposition === "backordered"
                                  ? `e.g., ${DEFAULT_BACKORDER_REASON}`
                                  : `e.g., ${DEFAULT_CANCEL_REASON}`
                              }
                              className="h-9 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                            />
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {(sharedDisposition === "backordered"
                                ? BACKORDER_QUICK_REASONS
                                : CANCEL_QUICK_REASONS
                              ).map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => {
                                    setValidationError(null);
                                    setSharedReason(chip);
                                  }}
                                  className={cn(
                                    "cursor-pointer whitespace-nowrap text-[11px] px-2.5 py-0.5 rounded-full border transition-colors",
                                    sharedReason === chip
                                      ? "bg-[#f0faf8] border-[#00b29a] text-[#087f70] font-semibold"
                                      : "bg-slate-100 border-border text-muted-foreground hover:text-foreground hover:border-slate-300"
                                  )}
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── PER-ITEM REMAINDER PLAN (WHEN CUSTOMIZED PER ITEM) ── */
                    <div className="space-y-2.5 pt-1">
                      {partialItemsWithLeftover.map((item) => {
                        const id = item.purchaseOrderLineItemId;
                        const remaining = getRemainingToReady(item);
                        const leftOver = remaining - getEffectiveItemQty(item);
                        const disp = dispositions[id] || "backordered";
                        const reason = dispositionReasons[id] || "";
                        const quickReasons =
                          disp === "backordered" ? BACKORDER_QUICK_REASONS : CANCEL_QUICK_REASONS;

                        return (
                          <div
                            key={id}
                            className="rounded-xl border border-border bg-slate-50/50 p-3 space-y-2.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-bold text-foreground">
                                  {item.name}{" "}
                                  <span className="text-amber-700 font-semibold">
                                    ({formatQtyWithUom(leftOver, item.unitOfMeasure)} remaining)
                                  </span>
                                </p>
                              </div>

                              {/* Compact Segmented Pill Switcher: Fulfill Later vs Cannot Supply */}
                              <div className="inline-flex rounded-lg border border-border bg-white p-0.5 self-start sm:self-center shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setValidationError(null);
                                    setDispositions((prev) => ({ ...prev, [id]: "backordered" }));
                                    if (CANCEL_QUICK_REASONS.includes(reason)) {
                                      setDispositionReasons((prev) => ({
                                        ...prev,
                                        [id]: "",
                                      }));
                                    }
                                  }}
                                  className={cn(
                                    "cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1",
                                    disp === "backordered"
                                      ? "bg-[#00b29a] text-white"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Clock className="h-3 w-3" />
                                  Fulfill later
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setValidationError(null);
                                    setDispositions((prev) => ({
                                      ...prev,
                                      [id]: "cannot_fulfill",
                                    }));
                                    if (BACKORDER_QUICK_REASONS.includes(reason)) {
                                      setDispositionReasons((prev) => ({
                                        ...prev,
                                        [id]: "",
                                      }));
                                    }
                                  }}
                                  className={cn(
                                    "cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1",
                                    disp === "cannot_fulfill"
                                      ? "bg-red-600 text-white"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <XCircle className="h-3 w-3" />
                                  Cannot supply
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {disp === "backordered" && (
                                <div className="space-y-1">
                                  <Label className="text-[11px] font-semibold text-foreground" required>
                                    Expected ready date
                                  </Label>
                                  <DatePicker
                                    date={expectedDates[id] ? new Date(expectedDates[id]) : undefined}
                                    onSelect={(d) => {
                                      setValidationError(null);
                                      setExpectedDates((prev) => ({
                                        ...prev,
                                        [id]: d ? format(d, "yyyy-MM-dd") : "",
                                      }));
                                    }}
                                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                    className={cn(
                                      "h-8 text-xs w-full bg-white",
                                      !expectedDates[id] && "border-amber-300"
                                    )}
                                  />
                                </div>
                              )}

                              <div
                                className={cn(
                                  "space-y-1",
                                  disp !== "backordered" && "sm:col-span-2"
                                )}
                              >
                                <Label className="text-[11px] font-semibold text-foreground" required>
                                  Reason / note for buyer
                                </Label>
                                <input
                                  type="text"
                                  value={reason}
                                  onChange={(e) => {
                                    setValidationError(null);
                                    setDispositionReasons((prev) => ({
                                      ...prev,
                                      [id]: e.target.value,
                                    }));
                                  }}
                                  placeholder={
                                    disp === "backordered"
                                      ? `e.g., ${DEFAULT_BACKORDER_REASON}`
                                      : `e.g., ${DEFAULT_CANCEL_REASON}`
                                  }
                                  className="h-8 px-2.5 text-xs border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                                />
                                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                  {quickReasons.map((chip) => (
                                    <button
                                      key={chip}
                                      type="button"
                                      onClick={() => {
                                        setValidationError(null);
                                        setDispositionReasons((prev) => ({
                                          ...prev,
                                          [id]: chip,
                                        }));
                                      }}
                                      className={cn(
                                        "cursor-pointer whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                        reason === chip
                                          ? "bg-[#f0faf8] border-[#00b29a] text-[#087f70] font-semibold"
                                          : "bg-white border-border text-muted-foreground hover:text-foreground"
                                      )}
                                    >
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ════════════════════════════════════════════════════════════
               STEP 2 (OR FULL FULFILLMENT VIEW): DELIVERY & DISPATCH
               ════════════════════════════════════════════════════════════ */
            <div className="space-y-4">
              {/* Compact Shipment Items Summary Pill Bar */}
              <div className="rounded-xl bg-[#f0faf8] border border-[#cbf0eb] px-4 py-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#00b29a] shrink-0" />
                    <span className="font-semibold text-foreground">
                      Fulfilling {totalDeliveringNow} of {totalRemainingUnits} unit{totalRemainingUnits === 1 ? "" : "s"}:
                    </span>
                  </div>
                  {!isFull && (
                    <button
                      type="button"
                      onClick={() => {
                        setValidationError(null);
                        setStep(1);
                      }}
                      className="cursor-pointer text-xs font-semibold text-[#087f70] hover:underline shrink-0"
                    >
                      Edit quantities
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {fulfillableItems
                    .filter((item) => getEffectiveItemQty(item) > 0)
                    .map((item) => {
                      const qty = getEffectiveItemQty(item);
                      return (
                        <span
                          key={item.purchaseOrderLineItemId}
                          className="px-2.5 py-1 rounded-md bg-white border border-[#cbf0eb] font-medium text-foreground"
                        >
                          {item.name}:{" "}
                          <strong>
                            {qty} {formatUomLabel(qty, item.unitOfMeasure)}
                          </strong>
                        </span>
                      );
                    })}
                </div>
              </div>

              {/* Sleek 2x2 Delivery Method Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">
                  Delivery Method
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DELIVERY_METHODS.map((m) => {
                    const Icon = m.icon;
                    const selected = fulfillmentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setValidationError(null);
                          setFulfillmentMethod(m.id);
                        }}
                        className={cn(
                          "cursor-pointer flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all bg-white",
                          selected
                            ? "border-[#00b29a] bg-[#f0faf8]/70 ring-1 ring-[#00b29a]/25"
                            : "border-border hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div
                            className={cn(
                              "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                              selected
                                ? "bg-[#00b29a] text-white"
                                : "bg-slate-100 text-muted-foreground"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <CustomRadioIndicator checked={selected} tone="teal" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground leading-tight">{m.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{m.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Essential Delivery Inputs */}
              {isPhysical && (
                <div className="rounded-xl border border-border bg-white p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {fulfillmentMethod === "carrier" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold" required>
                          Courier / Carrier Name
                        </Label>
                        <input
                          type="text"
                          value={carrier}
                          onChange={(e) => {
                            setValidationError(null);
                            setCarrier(e.target.value);
                          }}
                          placeholder="e.g., DHL, FedEx, GIG Logistics"
                          className="h-10 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold" required>
                        Expected Arrival Date
                      </Label>
                      <DatePicker
                        date={expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined}
                        onSelect={(d) => {
                          setValidationError(null);
                          setExpectedDeliveryDate(d ? format(d, "yyyy-MM-dd") : "");
                        }}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="h-10 bg-white w-full"
                      />
                    </div>

                    {fulfillmentMethod === "carrier" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-semibold">
                          Tracking Number <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <input
                          type="text"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          placeholder="e.g., 1Z999AA10123456784"
                          className="h-10 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-semibold">
                            Waybill / Delivery Note # <span className="text-muted-foreground font-normal">(Optional)</span>
                          </Label>
                          <button
                            type="button"
                            onClick={generateUniqueWaybillNumber}
                            className="text-[11px] font-semibold text-[#00b29a] hover:underline"
                          >
                            Auto-generate
                          </button>
                        </div>
                        <Input
                          value={fulfillmentReference}
                          onChange={(e) => {
                            setValidationError(null);
                            setFulfillmentReference(e.target.value);
                          }}
                          placeholder={`e.g., WB-2026-0${nextShipmentNumber} (leave blank to auto-generate)`}
                          className={cn(
                            "h-10 bg-white",
                            isDuplicateReference && "border-red-400 focus:border-red-500 focus:ring-red-200"
                          )}
                        />
                        {isDuplicateReference ? (
                          <p className="text-[11px] text-red-600 font-medium">
                            &ldquo;{trimmedRef}&rdquo; was already used on a previous shipment. Click{" "}
                            <button
                              type="button"
                              onClick={generateUniqueWaybillNumber}
                              className="underline font-bold"
                            >
                              Auto-generate
                            </button>{" "}
                            or enter a unique number for Shipment #{nextShipmentNumber}.
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Must be a unique number for this shipment (or leave blank to auto-generate).
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progressive Disclosure for Extra Paperwork / Notes */}
                  <div className="pt-2 border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => setShowOptionalPaperwork((v) => !v)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#087f70] hover:underline"
                    >
                      {showOptionalPaperwork ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Hide extra reference fields &amp; notes
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          + Add packing slip # or delivery notes (optional)
                        </>
                      )}
                    </button>

                    {showOptionalPaperwork && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3 pt-2">
                        {fulfillmentMethod === "carrier" && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-semibold">
                                Waybill / Delivery Note # <span className="text-muted-foreground font-normal">(Optional)</span>
                              </Label>
                              <button
                                type="button"
                                onClick={generateUniqueWaybillNumber}
                                className="text-[11px] font-semibold text-[#00b29a] hover:underline"
                              >
                                Auto-generate
                              </button>
                            </div>
                            <Input
                              value={fulfillmentReference}
                              onChange={(e) => {
                                setValidationError(null);
                                setFulfillmentReference(e.target.value);
                              }}
                              placeholder={`e.g., WB-2026-0${nextShipmentNumber} (or leave blank)`}
                              className={cn(
                                "h-9 bg-white",
                                isDuplicateReference && "border-red-400 focus:border-red-500 focus:ring-red-200"
                              )}
                            />
                            {isDuplicateReference && (
                              <p className="text-[11px] text-red-600 font-medium">
                                Already used on an earlier shipment — must be unique per delivery.
                              </p>
                            )}
                          </div>
                        )}
                        <div className={cn("space-y-1.5", fulfillmentMethod !== "carrier" && "sm:col-span-2")}>
                          <Label className="text-xs font-semibold">
                            Packing Slip # <span className="text-muted-foreground font-normal">(Optional)</span>
                          </Label>
                          <input
                            type="text"
                            value={packingSlipNumber}
                            onChange={(e) => setPackingSlipNumber(e.target.value)}
                            placeholder="Optional"
                            className="h-9 px-3 text-sm border border-border rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs font-semibold">
                            Delivery Notes <span className="text-muted-foreground font-normal">(Optional)</span>
                          </Label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any instructions for the buyer's receiving team..."
                            rows={2}
                            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isPhysical && (
                <div className="rounded-xl border border-border bg-white p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Reference or Completion Note <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add a link, license reference, or summary of completed work..."
                      rows={3}
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                    />
                  </div>
                </div>
              )}

              {/* Branded Custom Checkbox Dispatch Toggle (Zero Native Browser Checkbox Styles) */}
              {isPhysical && (
                <div
                  className={cn(
                    "p-3.5 rounded-xl border transition-all",
                    dispatchNow
                      ? "border-[#cbf0eb] bg-[#f0faf8]/80"
                      : "border-border bg-white"
                  )}
                >
                  <Checkbox
                    checked={dispatchNow}
                    onCheckedChange={(checked) => setDispatchNow(checked)}
                    label="Mark shipment as dispatched right now (Recommended)"
                    description={
                      dispatchNow
                        ? "The buyer will be notified immediately that these items are on the way so they can confirm receipt."
                        : "Unchecked: Items will only be saved as packed. You will need to click 'Dispatch Shipment' later when the vehicle leaves."
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Clean Single-Action Footer with Clear Guidance ── */}
        <div className="px-6 py-4 border-t border-border bg-white flex items-center justify-between gap-3 shrink-0">
          {step === 1 && !isFull ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <div className="flex items-center gap-3 min-w-0">
                {validateStep1() && (
                  <span className="hidden sm:inline-block text-[11px] font-medium text-amber-700 text-right truncate max-w-[280px]">
                    {validateStep1()}
                  </span>
                )}
                <Button
                  variant="primary"
                  onClick={handleContinueToStep2}
                  disabled={!!validateStep1() || isSubmitting}
                >
                  Continue to Delivery
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </>
          ) : (
            <>
              {isFull ? (
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setValidationError(null);
                    setStep(1);
                  }}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back to Quantities
                </Button>
              )}
              <div className="flex items-center gap-3 min-w-0">
                {validateStep2() && (
                  <span className="hidden sm:inline-block text-[11px] font-medium text-amber-700 text-right truncate max-w-[280px]">
                    {validateStep2()}
                  </span>
                )}
                <Button
                  variant="primary"
                  onClick={handleFinalSubmit}
                  loading={isSubmitting}
                  disabled={!!validateStep2() || isSubmitting}
                >
                  {isPhysical ? (
                    dispatchNow ? (
                      <>
                        <Send className="h-4 w-4 mr-1.5" />
                        Confirm &amp; Dispatch Now
                      </>
                    ) : (
                      "Save as Packed (Dispatch Later)"
                    )
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Complete Delivery
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
