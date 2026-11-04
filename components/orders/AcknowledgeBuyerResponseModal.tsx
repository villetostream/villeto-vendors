"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Package, Calendar, AlertCircle, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";
import type {
  Fulfillment,
  FulfillmentLineItem,
  AcknowledgeResolutionPayload,
  LineItemResolution,
} from "@/lib/types";

interface AcknowledgeBuyerResponseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AcknowledgeResolutionPayload) => void;
  fulfillment: Fulfillment | null;
  fulfillmentIndex?: number;
  isSubmitting?: boolean;
  onSwitchToDispute?: () => void;
}

export function AcknowledgeBuyerResponseModal({
  open,
  onClose,
  onSubmit,
  fulfillment,
  fulfillmentIndex = 0,
  isSubmitting = false,
  onSwitchToDispute,
}: AcknowledgeBuyerResponseModalProps) {
  // Global action for single-item or "all same" mode
  const [globalAction, setGlobalAction] = useState<"backorder" | "forfeit">("backorder");
  const [globalExpectedDate, setGlobalExpectedDate] = useState<string>("");

  // Mode for multi-item rejections
  const [mode, setMode] = useState<"all_same" | "per_item">("all_same");

  // Per-item choices
  const [perItemActions, setPerItemActions] = useState<Record<string, "backorder" | "forfeit">>({});
  const [perItemDates, setPerItemDates] = useState<Record<string, string>>({});

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setGlobalAction("backorder");
      setGlobalExpectedDate("");
      setMode("all_same");

      if (fulfillment) {
        const initialActions: Record<string, "backorder" | "forfeit"> = {};
        const initialDates: Record<string, string> = {};
        for (const li of fulfillment.lineItems) {
          const id = li.vendorDeliveryNoticeLineItemId || li.purchaseOrderLineItemId;
          initialActions[id] = "backorder";
          initialDates[id] = "";
        }
        setPerItemActions(initialActions);
        setPerItemDates(initialDates);
      }
    }
  }, [open, fulfillment]);

  if (!fulfillment) return null;

  // Calculate fulfillment-level stats
  const rejectedItems: FulfillmentLineItem[] = fulfillment.lineItems.filter((li) => {
    const rejected = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
    return rejected > 0;
  });

  const totalDelivered = fulfillment.totalDeliveredQuantity ?? fulfillment.lineItems.reduce(
    (acc, li) => acc + (li.quantityReady || li.quantityShipped || 0),
    0
  );

  const totalAccepted = fulfillment.totalAcceptedQuantity ?? fulfillment.lineItems.reduce(
    (acc, li) => acc + (li.quantityAccepted ?? li.quantityReceived ?? 0),
    0
  );

  const totalRejected = fulfillment.totalRejectedQuantity ?? Math.max(0, totalDelivered - totalAccepted);

  const fulfillmentTitle = fulfillment.fulfillmentReference
    ? `Shipment #${fulfillmentIndex + 1} (${fulfillment.fulfillmentReference})`
    : `Shipment #${fulfillmentIndex + 1}`;

  const isMultiItem = rejectedItems.length > 1;

  // Validation
  const isValid = () => {
    if (mode === "all_same" || !isMultiItem) {
      if (globalAction === "backorder" && !globalExpectedDate) return false;
      return true;
    }

    // Per-item validation
    return rejectedItems.every((li) => {
      const id = li.vendorDeliveryNoticeLineItemId || li.purchaseOrderLineItemId;
      const act = perItemActions[id] || "backorder";
      if (act === "backorder") {
        return !!perItemDates[id];
      }
      return true;
    });
  };

  const handleSubmit = () => {
    const resolutions: LineItemResolution[] = rejectedItems.map((li) => {
      const id = li.vendorDeliveryNoticeLineItemId || li.purchaseOrderLineItemId;
      const rejectedQty = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
      const action = mode === "all_same" || !isMultiItem ? globalAction : (perItemActions[id] || "backorder");
      const date = mode === "all_same" || !isMultiItem ? globalExpectedDate : (perItemDates[id] || undefined);

      return {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId,
        vendorDeliveryNoticeLineItemId: li.vendorDeliveryNoticeLineItemId,
        name: li.name,
        quantityRejected: rejectedQty,
        buyerReason: li.rejectionReason || fulfillment.rejectionReason,
        buyerCategory: li.rejectionCategory || fulfillment.rejectionCategory,
        action,
        expectedReadyDate: action === "backorder" ? date : undefined,
      };
    });

    const isMixed = isMultiItem && mode === "per_item" && resolutions.some((r) => r.action !== resolutions[0]?.action);
    const firstAction = (resolutions[0]?.action === "forfeit" ? "forfeit" : "backorder") as "backorder" | "forfeit";
    const resolutionType: "backorder" | "forfeit" | "mixed" = isMixed
      ? "mixed"
      : mode === "per_item"
      ? firstAction
      : globalAction;

    onSubmit({
      fulfillmentId: fulfillment.vendorDeliveryNoticeId,
      shipmentReference: fulfillment.shipmentReference || fulfillment.fulfillmentReference || undefined,
      resolutionType,
      expectedReadyDate: mode === "all_same" ? (globalExpectedDate || undefined) : undefined,
      resolutions,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl" className="p-0 overflow-hidden max-h-[88vh] flex flex-col gap-0 rounded-2xl max-w-2xl sm:max-w-3xl">
        {/* ── Fixed Header ── */}
        <div className="px-7 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground">
            Acknowledge Buyer&apos;s Response
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-0.5">
            You are acknowledging the buyer&apos;s decision for{" "}
            <span className="font-medium text-foreground">{fulfillmentTitle}</span>.
          </DialogDescription>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6 pb-10">
          {/* ── Stat boxes (Delivered, Accepted, Rejected) ── */}
          <div className="grid grid-cols-3 bg-[#e8f7f5]/70 rounded-2xl py-3.5 px-3 border border-[#cbf0eb] text-center">
            <div className="px-2">
              <p className="text-xs text-muted-foreground font-medium">Delivered</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{totalDelivered}</p>
            </div>
            <div className="px-2 border-x border-[#cbf0eb]">
              <p className="text-xs text-muted-foreground font-medium">Accepted</p>
              <p className="text-2xl font-bold text-[#087f70] mt-0.5">{totalAccepted}</p>
            </div>
            <div className="px-2">
              <p className="text-xs text-muted-foreground font-medium">Rejected</p>
              <p className="text-2xl font-bold text-[#e14856] mt-0.5">{totalRejected}</p>
            </div>
          </div>

          {/* ── Buyer Rejection Context Notice ── */}
          {(fulfillment.rejectionReason || fulfillment.rejectionCategory) && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Buyer Inspection Finding</span>
                {fulfillment.rejectionCategory && (
                  <span className="font-normal text-[11px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 capitalize">
                    {fulfillment.rejectionCategory.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-amber-900 leading-relaxed pl-5">
                {fulfillment.rejectionReason}
              </p>
              {fulfillment.buyerAttachmentName && (
                <p className="text-[11px] text-amber-700 pl-5 pt-0.5">
                  Attachment: <span className="underline">{fulfillment.buyerAttachmentName}</span>
                </p>
              )}
            </div>
          )}

          {/* ── Multi-item toggle if more than 1 item rejected ── */}
          {isMultiItem && (
            <div className="bg-muted/40 rounded-xl p-3 border border-border flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                {rejectedItems.length} items have rejected quantities
              </span>
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setMode("all_same")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-colors",
                    mode === "all_same"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All same action
                </button>
                <button
                  type="button"
                  onClick={() => setMode("per_item")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-colors",
                    mode === "per_item"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Specific per item
                </button>
              </div>
            </div>
          )}

          {/* ── Mode 1: ALL SAME / SINGLE ITEM VIEW (Matching Screenshot 2 & 3) ── */}
          {(mode === "all_same" || !isMultiItem) && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">
                What will happen to the remaining {totalRejected} units?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Backorder Card */}
                <div
                  onClick={() => setGlobalAction("backorder")}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-2 select-none",
                    globalAction === "backorder"
                      ? "border-[#00b29a] bg-[#f0faf8]"
                      : "border-border hover:border-border/80 bg-white"
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">Backorder</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Keep the {totalRejected} units as a pending delivery. You can fulfil and resubmit them later.
                    </p>
                  </div>
                </div>

                {/* Forfeit Card */}
                <div
                  onClick={() => setGlobalAction("forfeit")}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-2 select-none",
                    globalAction === "forfeit"
                      ? "border-[#00b29a] bg-[#f0faf8]"
                      : "border-border hover:border-border/80 bg-white"
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">Forfeit</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Cancel the remaining {totalRejected} units. The order will be considered fulfilled at {totalAccepted} units.
                    </p>
                  </div>
                </div>
              </div>

              {/* Datepicker when Backorder is selected */}
              {globalAction === "backorder" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-sm font-semibold text-foreground" required>
                    New Expected Date
                  </Label>
                  <DatePicker
                    date={globalExpectedDate ? new Date(globalExpectedDate) : undefined}
                    onSelect={(d) => setGlobalExpectedDate(d ? format(d, "yyyy-MM-dd") : "")}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="h-11 w-full bg-white text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    When you expect to have the replacement units ready for delivery.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Mode 2: PER-ITEM SPECIFIC CHOICES ── */}
          {mode === "per_item" && isMultiItem && (
            <div className="space-y-3.5">
              <p className="text-sm font-semibold text-foreground">
                Set resolution for each rejected line item:
              </p>

              {rejectedItems.map((li) => {
                const id = li.vendorDeliveryNoticeLineItemId || li.purchaseOrderLineItemId;
                const itemRejected = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
                const currentAction = perItemActions[id] || "backorder";
                const currentDate = perItemDates[id] || "";

                return (
                  <div
                    key={id}
                    className="p-4 rounded-xl border border-border bg-white space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{li.name}</span>
                      <span className="text-xs font-bold text-[#e14856] bg-red-50 border border-red-200/50 px-2 py-0.5 rounded-full">
                        {itemRejected} units rejected
                      </span>
                    </div>

                    {li.rejectionReason && (
                      <p className="text-xs text-muted-foreground italic">
                        Buyer reason: {li.rejectionReason}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setPerItemActions((prev) => ({ ...prev, [id]: "backorder" }))
                        }
                        className={cn(
                          "py-2 px-3 rounded-lg border font-medium text-left transition-colors",
                          currentAction === "backorder"
                            ? "border-[#00b29a] bg-[#f0faf8] text-[#00b29a] font-semibold"
                            : "border-border text-muted-foreground hover:bg-muted/30"
                        )}
                      >
                        Backorder ({itemRejected} units)
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPerItemActions((prev) => ({ ...prev, [id]: "forfeit" }))
                        }
                        className={cn(
                          "py-2 px-3 rounded-lg border font-medium text-left transition-colors",
                          currentAction === "forfeit"
                            ? "border-[#00b29a] bg-[#f0faf8] text-[#00b29a] font-semibold"
                            : "border-border text-muted-foreground hover:bg-muted/30"
                        )}
                      >
                        Forfeit / Cancel
                      </button>
                    </div>

                    {currentAction === "backorder" && (
                      <div className="space-y-1 pt-1">
                        <Label className="text-[11px] font-semibold text-foreground" required>
                          Expected Ready Date for {li.name}
                        </Label>
                        <DatePicker
                          date={currentDate ? new Date(currentDate) : undefined}
                          onSelect={(d) =>
                            setPerItemDates((prev) => ({
                              ...prev,
                              [id]: d ? format(d, "yyyy-MM-dd") : "",
                            }))
                          }
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          className="h-9 w-full bg-white text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Switch to Dispute Link ── */}
          {onSwitchToDispute && (
            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Disagree with the buyer&apos;s findings?{" "}
                <button
                  type="button"
                  onClick={onSwitchToDispute}
                  className="text-primary font-semibold hover:underline"
                >
                  File a Dispute instead
                </button>
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border bg-gray-50/50 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!isValid() || isSubmitting}
            className="bg-[#00b29a] hover:bg-[#009b86] text-white px-5 shadow-xs"
          >
            Submit Acknowledgement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
