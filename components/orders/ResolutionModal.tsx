"use client";

import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Package,
  Calendar as CalendarIcon,
  AlertCircle,
  XCircle,
  Clock,
  Layers,
  UploadCloud,
  FileText,
  X,
  ShieldAlert,
} from "lucide-react";
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
  VendorResolutionAction,
  LineItemResolution,
  UnifiedResolutionPayload,
} from "@/lib/types";

// ── Custom Styled Radio Indicator (No native browser styles) ──
function CustomRadio({
  checked,
  color = "teal",
}: {
  checked: boolean;
  color?: "teal" | "purple" | "rose";
}) {
  const activeColor =
    color === "purple"
      ? "border-purple-600 bg-purple-600"
      : color === "rose"
      ? "border-rose-600 bg-rose-600"
      : "border-[#00b29a] bg-[#00b29a]";

  return (
    <div
      className={cn(
        "h-4 w-4 rounded-full border flex items-center justify-center transition-all duration-150 shrink-0 select-none",
        checked ? cn("border-2", activeColor) : "border-border bg-white"
      )}
    >
      {checked && (
        <div className="h-1.5 w-1.5 rounded-full bg-white animate-in zoom-in-75 duration-100" />
      )}
    </div>
  );
}

export interface ResolutionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UnifiedResolutionPayload) => void;
  fulfillment: Fulfillment | null;
  fulfillmentIndex?: number;
  /**
   * If specified, only this specific line item is being resolved.
   * If null/undefined, resolves all rejected items in the fulfillment.
   */
  targetLineItemId?: string | null;
  initialAction?: VendorResolutionAction;
  isSubmitting?: boolean;
}

export function ResolutionModal({
  open,
  onClose,
  onSubmit,
  fulfillment,
  fulfillmentIndex = 0,
  targetLineItemId = null,
  initialAction = "backorder",
  isSubmitting = false,
}: ResolutionModalProps) {
  // Mode: "per_item" or "all_same"
  const [mode, setMode] = useState<"all_same" | "per_item">("per_item");

  // Global action when mode is "all_same"
  const [globalAction, setGlobalAction] = useState<VendorResolutionAction>(initialAction);
  const [globalDate, setGlobalDate] = useState<string>("");
  const [globalDisputeReason, setGlobalDisputeReason] = useState<string>("");
  const [globalAttachment, setGlobalAttachment] = useState<File | null>(null);

  // Per-item state keyed by purchaseOrderLineItemId
  const [itemActions, setItemActions] = useState<Record<string, VendorResolutionAction>>({});
  const [itemDates, setItemDates] = useState<Record<string, string>>({});
  const [itemDisputeReasons, setItemDisputeReasons] = useState<Record<string, string>>({});
  const [itemAttachments, setItemAttachments] = useState<Record<string, File | null>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeItemForUpload, setActiveItemForUpload] = useState<string | null>(null);

  // Initialize form state whenever modal opens or fulfillment changes
  useEffect(() => {
    if (open && fulfillment) {
      setGlobalAction(initialAction);
      setGlobalDate("");
      setGlobalDisputeReason("");
      setGlobalAttachment(null);

      const initActions: Record<string, VendorResolutionAction> = {};
      const initDates: Record<string, string> = {};
      const initReasons: Record<string, string> = {};
      const initAttachments: Record<string, File | null> = {};

      for (const li of fulfillment.lineItems) {
        const id = li.purchaseOrderLineItemId;
        initActions[id] = targetLineItemId && targetLineItemId === id ? initialAction : "backorder";
        initDates[id] = "";
        initReasons[id] = "";
        initAttachments[id] = null;
      }

      setItemActions(initActions);
      setItemDates(initDates);
      setItemDisputeReasons(initReasons);
      setItemAttachments(initAttachments);
      setMode(targetLineItemId ? "per_item" : "per_item");
    }
  }, [open, fulfillment, targetLineItemId, initialAction]);

  if (!fulfillment) return null;

  // Filter rejected items
  const allRejectedItems = fulfillment.lineItems.filter((li) => {
    const rejected = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
    return rejected > 0;
  });

  // If a specific target line item is selected, focus on it
  const activeItems = targetLineItemId
    ? allRejectedItems.filter((li) => li.purchaseOrderLineItemId === targetLineItemId)
    : allRejectedItems;

  const totalDelivered = fulfillment.totalDeliveredQuantity ?? fulfillment.lineItems.reduce(
    (acc, li) => acc + (li.quantityReady || li.quantityShipped || 0),
    0
  );

  const totalAccepted = fulfillment.totalAcceptedQuantity ?? fulfillment.lineItems.reduce(
    (acc, li) => acc + (li.quantityAccepted ?? li.quantityReceived ?? 0),
    0
  );

  const totalRejected = targetLineItemId
    ? activeItems.reduce((acc, li) => acc + (li.quantityRejected || 0), 0)
    : (fulfillment.totalRejectedQuantity ?? Math.max(0, totalDelivered - totalAccepted));

  const isMultiItem = activeItems.length > 1;
  const isTargetedSingle = !!targetLineItemId && activeItems.length === 1;

  const fulfillmentTitle = fulfillment.fulfillmentReference
    ? `Shipment #${fulfillmentIndex + 1} (${fulfillment.fulfillmentReference})`
    : `Shipment #${fulfillmentIndex + 1}`;

  // File upload handlers
  const handleTriggerUpload = (itemId: string | null) => {
    setActiveItemForUpload(itemId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File exceeds 10MB limit. Please upload a smaller file.");
      return;
    }

    if (activeItemForUpload) {
      setItemAttachments((prev) => ({ ...prev, [activeItemForUpload]: file }));
    } else {
      setGlobalAttachment(file);
    }
  };

  const handleRemoveFile = (itemId: string | null) => {
    if (itemId) {
      setItemAttachments((prev) => ({ ...prev, [itemId]: null }));
    } else {
      setGlobalAttachment(null);
    }
  };

  // Validation
  const isValid = () => {
    if (mode === "all_same" && !isTargetedSingle) {
      if (globalAction === "backorder" && !globalDate) return false;
      if (globalAction === "dispute" && !globalDisputeReason.trim()) return false;
      return true;
    }

    // Per-item validation
    return activeItems.every((li) => {
      const id = li.purchaseOrderLineItemId;
      const act = itemActions[id] || "backorder";
      if (act === "backorder" && !itemDates[id]) return false;
      if (act === "dispute" && !itemDisputeReasons[id]?.trim()) return false;
      return true;
    });
  };

  const handleSubmit = () => {
    const resolutions: LineItemResolution[] = activeItems.map((li) => {
      const id = li.purchaseOrderLineItemId;
      const rejectedQty = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
      const action = (mode === "all_same" && !isTargetedSingle) ? globalAction : (itemActions[id] || "backorder");
      const date = (mode === "all_same" && !isTargetedSingle) ? globalDate : itemDates[id];
      const disputeReason = (mode === "all_same" && !isTargetedSingle) ? globalDisputeReason : itemDisputeReasons[id];
      const file = (mode === "all_same" && !isTargetedSingle) ? globalAttachment : itemAttachments[id];

      return {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId,
        vendorDeliveryNoticeLineItemId: li.vendorDeliveryNoticeLineItemId,
        name: li.name,
        quantityRejected: rejectedQty,
        buyerReason: li.rejectionReason || fulfillment.rejectionReason,
        buyerCategory: li.rejectionCategory || fulfillment.rejectionCategory,
        action,
        expectedReadyDate: action === "backorder" ? date : undefined,
        disputeReason: action === "dispute" ? disputeReason : undefined,
        attachmentName: file?.name,
        attachmentFile: file || undefined,
      };
    });

    const hasDispute = resolutions.some((r) => r.action === "dispute");
    const hasAcknowledge = resolutions.some((r) => r.action === "backorder" || r.action === "forfeit");
    const overallStatus: "acknowledged" | "disputed" | "mixed" =
      hasDispute && hasAcknowledge
        ? "mixed"
        : hasDispute
        ? "disputed"
        : "acknowledged";

    onSubmit({
      fulfillmentId: fulfillment.vendorDeliveryNoticeId,
      shipmentReference: fulfillment.shipmentReference || fulfillment.fulfillmentReference || undefined,
      overallStatus,
      resolutions,
    });
  };

  // Compute live action counts for footer
  const disputeCount = activeItems.filter((li) =>
    (mode === "all_same" && !isTargetedSingle ? globalAction : itemActions[li.purchaseOrderLineItemId]) === "dispute"
  ).length;
  const backorderCount = activeItems.filter((li) =>
    (mode === "all_same" && !isTargetedSingle ? globalAction : itemActions[li.purchaseOrderLineItemId]) === "backorder"
  ).length;
  const forfeitCount = activeItems.filter((li) =>
    (mode === "all_same" && !isTargetedSingle ? globalAction : itemActions[li.purchaseOrderLineItemId]) === "forfeit"
  ).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileChange}
        className="hidden"
        disabled={isSubmitting}
      />

      <DialogContent
        size="xl"
        className="p-0 overflow-hidden max-h-[88vh] flex flex-col gap-0 rounded-2xl w-full max-w-3xl lg:max-w-4xl shadow-2xl border border-border"
      >
        {/* ── Fixed Spacious Header ── */}
        <div className="px-8 pt-6 pb-4.5 border-b border-border bg-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#00b29a]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vendor Inspection Review
            </span>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground mt-1">
            {isTargetedSingle
              ? `Resolve Finding: ${activeItems[0]?.name}`
              : `Review Buyer Inspection Findings`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Resolve rejected quantities for{" "}
            <span className="font-semibold text-foreground">{fulfillmentTitle}</span>. You can
            dispute items rejected in error or acknowledge them for backorder/cancellation.
          </DialogDescription>
        </div>

        {/* ── Scrollable Body with Generous Clearance ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-12">
          {/* ── Compact Stat Strip (No vertical clutter) ── */}
          <div className="grid grid-cols-3 bg-[#e8f7f5]/80 rounded-xl py-2.5 px-4 border border-[#cbf0eb] text-center">
            <div>
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Delivered
              </span>
              <p className="text-lg font-bold text-foreground">{totalDelivered}</p>
            </div>
            <div className="border-x border-[#cbf0eb]">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Accepted
              </span>
              <p className="text-lg font-bold text-[#087f70]">{totalAccepted}</p>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Rejected
              </span>
              <p className="text-lg font-bold text-[#e14856]">{totalRejected}</p>
            </div>
          </div>

          {/* ── Buyer Inspection Finding Summary Card ── */}
          {(fulfillment.rejectionReason || fulfillment.rejectionCategory) && (
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Buyer Inspection Finding</span>
                </div>
                {fulfillment.rejectionCategory && (
                  <span className="font-semibold text-[11px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full capitalize">
                    {fulfillment.rejectionCategory.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-amber-900 leading-relaxed pl-5.5">
                {fulfillment.rejectionReason}
              </p>
              {fulfillment.buyerAttachmentName && (
                <div className="pl-5.5 pt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md">
                    <FileText className="h-3 w-3 text-amber-700" />
                    {fulfillment.buyerAttachmentName}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Multi-item mode switcher if multiple items are rejected ── */}
          {isMultiItem && !isTargetedSingle && (
            <div className="bg-muted/40 rounded-xl p-3 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#00b29a]" />
                <span className="text-xs font-semibold text-foreground">
                  {activeItems.length} items have rejected quantities
                </span>
              </div>
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-border text-xs self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setMode("per_item")}
                  className={cn(
                    "px-3 py-1.5 rounded-md font-semibold transition-all",
                    mode === "per_item"
                      ? "bg-[#00b29a] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Custom per item (Mix actions)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("all_same")}
                  className={cn(
                    "px-3 py-1.5 rounded-md font-semibold transition-all",
                    mode === "all_same"
                      ? "bg-[#00b29a] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All same action
                </button>
              </div>
            </div>
          )}

          {/* ── Mode 1: ALL SAME ACTION MODE ── */}
          {mode === "all_same" && !isTargetedSingle && (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Apply Action to All {totalRejected} Rejected Units
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Backorder Card */}
                <div
                  onClick={() => setGlobalAction("backorder")}
                  className={cn(
                    "p-4.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 select-none",
                    globalAction === "backorder"
                      ? "border-[#00b29a] bg-[#f0faf8]/80 shadow-xs"
                      : "border-border hover:border-border/80 bg-white"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CustomRadio checked={globalAction === "backorder"} color="teal" />
                      <span className="text-xs font-bold text-foreground">Backorder</span>
                    </div>
                    <div className="h-7 w-7 rounded-lg bg-[#00b29a]/10 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-[#00b29a]" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Reschedule replacement units for future delivery.
                  </p>
                </div>

                {/* Forfeit Card */}
                <div
                  onClick={() => setGlobalAction("forfeit")}
                  className={cn(
                    "p-4.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 select-none",
                    globalAction === "forfeit"
                      ? "border-rose-500 bg-rose-50/70 shadow-xs"
                      : "border-border hover:border-border/80 bg-white"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CustomRadio checked={globalAction === "forfeit"} color="rose" />
                      <span className="text-xs font-bold text-foreground">Forfeit</span>
                    </div>
                    <div className="h-7 w-7 rounded-lg bg-rose-100/70 flex items-center justify-center">
                      <XCircle className="h-4 w-4 text-rose-600" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Cancel units and consider order fulfilled at accepted qty.
                  </p>
                </div>

                {/* Dispute Card */}
                <div
                  onClick={() => setGlobalAction("dispute")}
                  className={cn(
                    "p-4.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 select-none",
                    globalAction === "dispute"
                      ? "border-purple-600 bg-purple-50/70 shadow-xs"
                      : "border-border hover:border-border/80 bg-white"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CustomRadio checked={globalAction === "dispute"} color="purple" />
                      <span className="text-xs font-bold text-foreground">Dispute</span>
                    </div>
                    <div className="h-7 w-7 rounded-lg bg-purple-100/70 flex items-center justify-center">
                      <ShieldAlert className="h-4 w-4 text-purple-600" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Reject buyer findings and submit evidence for review.
                  </p>
                </div>
              </div>

              {/* Backorder Global Date Picker */}
              {globalAction === "backorder" && (
                <div className="space-y-1.5 p-4 rounded-xl border border-border bg-white shadow-xs">
                  <Label className="text-xs font-semibold text-foreground" required>
                    New Expected Ready Date for All Items
                  </Label>
                  <DatePicker
                    date={globalDate ? new Date(globalDate) : undefined}
                    onSelect={(d) => setGlobalDate(d ? format(d, "yyyy-MM-dd") : "")}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="h-10 w-full bg-white text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Estimated date when replacement batch will be ready to ship.
                  </p>
                </div>
              )}

              {/* Dispute Global Reason & Upload */}
              {globalAction === "dispute" && (
                <div className="space-y-3.5 p-4 rounded-xl border border-border bg-white shadow-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground" required>
                      Enter Reason for Dispute
                    </Label>
                    <textarea
                      value={globalDisputeReason}
                      onChange={(e) => setGlobalDisputeReason(e.target.value)}
                      placeholder="Explain why the shipment was delivered properly and why buyer inspection was incorrect..."
                      rows={3}
                      className="w-full rounded-xl border border-border p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                    />
                  </div>

                  {/* Attachment Box */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">
                      Dispute Attachment (Optional)
                    </Label>
                    <div className="p-3 rounded-xl border-2 border-dashed border-[#cbf0eb] bg-[#f0faf8]/50 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <UploadCloud className="h-5 w-5 text-[#00b29a]" />
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {globalAttachment ? globalAttachment.name : "Upload inspection proof or shipping manifest"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">PDF, JPG or PNG up to 10MB</p>
                        </div>
                      </div>
                      {globalAttachment ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(null)}
                          className="p-1 hover:bg-black/5 rounded-md text-muted-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleTriggerUpload(null)}
                          className="h-7 text-xs border-[#00b29a] text-[#00b29a] hover:bg-[#00b29a]/10"
                        >
                          Upload
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Mode 2: PER-ITEM CUSTOM CHOICES (Allows Disputing Pen & Acknowledging Cable) ── */}
          {(mode === "per_item" || isTargetedSingle) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Individual Line Item Decisions
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Choose specific action for each rejected line
                </span>
              </div>

              {activeItems.map((li) => {
                const id = li.purchaseOrderLineItemId;
                const rejectedQty = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
                const currentAction = itemActions[id] || "backorder";
                const currentDate = itemDates[id] || "";
                const currentReason = itemDisputeReasons[id] || "";
                const currentAttachment = itemAttachments[id] || null;

                return (
                  <div
                    key={id}
                    className="p-5 rounded-2xl border border-border bg-white shadow-xs space-y-4 transition-all"
                  >
                    {/* Item Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{li.name}</span>
                          <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full">
                            {rejectedQty} units rejected
                          </span>
                        </div>
                        {li.rejectionReason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium text-foreground">Buyer reason: </span>
                            {li.rejectionReason}
                          </p>
                        )}
                      </div>

                      {/* Custom Segmented Pill Selector (No native radios) */}
                      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl border border-border/60 self-start sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => setItemActions((prev) => ({ ...prev, [id]: "backorder" }))}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                            currentAction === "backorder"
                              ? "bg-white text-[#00b29a] shadow-xs border border-[#00b29a]/40"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Backorder
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemActions((prev) => ({ ...prev, [id]: "forfeit" }))}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                            currentAction === "forfeit"
                              ? "bg-white text-rose-600 shadow-xs border border-rose-200"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Forfeit
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemActions((prev) => ({ ...prev, [id]: "dispute" }))}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                            currentAction === "dispute"
                              ? "bg-white text-purple-700 shadow-xs border border-purple-200"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Dispute
                        </button>
                      </div>
                    </div>

                    {/* Contextual Sub-Card: Backorder Date Picker */}
                    {currentAction === "backorder" && (
                      <div className="p-3.5 rounded-xl bg-[#f0faf8]/70 border border-[#cbf0eb] space-y-1.5 animate-in fade-in-50 duration-150">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1" required>
                          <CalendarIcon className="h-3.5 w-3.5 text-[#00b29a]" />
                          Expected Ready Date for {li.name}
                        </Label>
                        <DatePicker
                          date={currentDate ? new Date(currentDate) : undefined}
                          onSelect={(d) =>
                            setItemDates((prev) => ({
                              ...prev,
                              [id]: d ? format(d, "yyyy-MM-dd") : "",
                            }))
                          }
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          className="h-9 w-full bg-white text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Keep {rejectedQty} units as backorder. Reschedule delivery when ready.
                        </p>
                      </div>
                    )}

                    {/* Contextual Sub-Card: Forfeit Explanation */}
                    {currentAction === "forfeit" && (
                      <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-200/60 text-xs text-rose-900 space-y-1 animate-in fade-in-50 duration-150">
                        <p className="font-semibold flex items-center gap-1.5 text-rose-800">
                          <XCircle className="h-3.5 w-3.5 text-rose-600" />
                          Forfeit / Cancel {rejectedQty} units of {li.name}
                        </p>
                        <p className="text-[11px] text-rose-700 leading-relaxed">
                          The buyer will deduct these {rejectedQty} units from the order balance and no replacement will be sent.
                        </p>
                      </div>
                    )}

                    {/* Contextual Sub-Card: Dispute Reason & Proof Upload */}
                    {currentAction === "dispute" && (
                      <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 animate-in fade-in-50 duration-150">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-purple-900 flex items-center gap-1" required>
                            <ShieldAlert className="h-3.5 w-3.5 text-purple-700" />
                            Reason for Disputing {li.name} Rejection
                          </Label>
                          <textarea
                            value={currentReason}
                            onChange={(e) =>
                              setItemDisputeReasons((prev) => ({ ...prev, [id]: e.target.value }))
                            }
                            placeholder={`Explain why ${li.name} was rejected incorrectly by buyer inspection...`}
                            rows={3}
                            className="w-full rounded-xl border border-purple-200 bg-white p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                          />
                        </div>

                        {/* File Upload for this item */}
                        <div className="p-3 rounded-xl border-2 border-dashed border-purple-200 bg-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UploadCloud className="h-4 w-4 text-purple-600" />
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                {currentAttachment ? currentAttachment.name : `Attach evidence for ${li.name}`}
                              </p>
                              <p className="text-[10px] text-muted-foreground">PDF, JPG or PNG up to 10MB</p>
                            </div>
                          </div>
                          {currentAttachment ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(id)}
                              className="p-1 hover:bg-black/5 rounded-md text-muted-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerUpload(id)}
                              className="h-7 text-xs border-purple-400 text-purple-700 hover:bg-purple-50"
                            >
                              Attach Proof
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Fixed Clean Footer with Summary & Buttons ── */}
        <div className="px-8 py-4.5 border-t border-border bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="font-semibold text-foreground">Summary: </span>
            {disputeCount > 0 && (
              <span className="text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                {disputeCount} disputed
              </span>
            )}
            {backorderCount > 0 && (
              <span className="text-[#00b29a] font-medium bg-[#f0faf8] px-2 py-0.5 rounded-md border border-[#cbf0eb]">
                {backorderCount} backordered
              </span>
            )}
            {forfeitCount > 0 && (
              <span className="text-rose-700 font-medium bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                {forfeitCount} forfeited
              </span>
            )}
            {disputeCount === 0 && backorderCount === 0 && forfeitCount === 0 && (
              <span>No actions selected</span>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!isValid() || isSubmitting}
              className="bg-[#00b29a] hover:bg-[#009b86] text-white px-6 shadow-xs font-semibold"
            >
              Submit Resolution
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
