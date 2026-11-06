"use client";

import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  AlertCircle,
  XCircle,
  Clock,
  Layers,
  UploadCloud,
  FileText,
  X,
  ShieldAlert,
  ExternalLink,
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
import { EvidenceGallery, LocalFilePreview } from "@/components/orders/EvidenceGallery";
import { cn, parseExceptionReason, formatExceptionReason } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Fulfillment,
  FulfillmentLineItem,
  VendorResolutionAction,
  LineItemResolution,
  UnifiedResolutionPayload,
} from "@/lib/types";

const ALLOWED_EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB

function getLineDeliveredQty(li: FulfillmentLineItem): number {
  const accepted = li.quantityAccepted ?? 0;
  const rejected = li.quantityRejected ?? 0;
  const missing = li.quantityMissing ?? 0;
  const sum = accepted + rejected + missing;
  if (sum > 0) return sum;
  return li.quantityReady || li.quantityShipped || li.quantityReceived || 0;
}

function getLineExceptionQty(li: FulfillmentLineItem): number {
  const rejected = li.quantityRejected ?? 0;
  const missing = li.quantityMissing ?? 0;
  if (rejected + missing > 0) return rejected + missing;
  return Math.max(
    0,
    (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0)
  );
}

/**
 * Numeric input that allows clearing with Backspace while typing and strips
 * any leading zero (so typing 15 never becomes "015" or "08").
 */
function DisputeUnitInput({
  value,
  max,
  onChange,
  className,
}: {
  value: number;
  max: number;
  onChange: (val: number) => void;
  className?: string;
}) {
  const [rawText, setRawText] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setRawText(String(value));
    }
  }, [value, isFocused]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={isFocused ? rawText : String(value)}
      onFocus={(e) => {
        setIsFocused(true);
        setRawText(String(value));
        e.target.select();
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = rawText.trim() === "" ? 0 : parseInt(rawText, 10) || 0;
        const clamped = Math.min(max, Math.max(0, parsed));
        setRawText(String(clamped));
        onChange(clamped);
      }}
      onChange={(e) => {
        // Keep only digits and strip any leading zeros before another digit ("012" -> "12")
        const digitsOnly = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (digitsOnly === "") {
          setRawText("");
          onChange(0);
          return;
        }
        const numeric = Math.min(max, Math.max(0, parseInt(digitsOnly, 10) || 0));
        setRawText(String(numeric));
        onChange(numeric);
      }}
      className={className}
    />
  );
}

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
   * If null/undefined, resolves all rejected/missing items in the fulfillment.
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
  const [globalAckReason, setGlobalAckReason] = useState<string>("");
  const [globalDisputeReason, setGlobalDisputeReason] = useState<string>("");
  const [globalAttachment, setGlobalAttachment] = useState<File | null>(null);

  // Per-item state keyed by purchaseOrderLineItemId
  const [itemActions, setItemActions] = useState<Record<string, VendorResolutionAction>>({});
  const [itemDates, setItemDates] = useState<Record<string, string>>({});
  const [itemAckReasons, setItemAckReasons] = useState<Record<string, string>>({});
  const [itemDisputeReasons, setItemDisputeReasons] = useState<Record<string, string>>({});
  const [itemAttachments, setItemAttachments] = useState<Record<string, File | null>>({});
  const [itemProposedQuantities, setItemProposedQuantities] = useState<
    Record<string, { accepted: number; rejected: number; missing: number }>
  >({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeItemForUpload, setActiveItemForUpload] = useState<string | null>(null);

  // Initialize form state whenever modal opens or fulfillment changes
  useEffect(() => {
    if (open && fulfillment) {
      setGlobalAction(initialAction);
      setGlobalDate("");
      setGlobalAckReason("");
      setGlobalDisputeReason("");
      setGlobalAttachment(null);

      const initActions: Record<string, VendorResolutionAction> = {};
      const initDates: Record<string, string> = {};
      const initAckReasons: Record<string, string> = {};
      const initReasons: Record<string, string> = {};
      const initAttachments: Record<string, File | null> = {};
      const initProposed: Record<
        string,
        { accepted: number; rejected: number; missing: number }
      > = {};

      for (const li of fulfillment.lineItems) {
        const id = li.purchaseOrderLineItemId;
        const delivered = getLineDeliveredQty(li);
        initActions[id] =
          targetLineItemId && targetLineItemId === id ? initialAction : initialAction;
        initDates[id] = "";
        initAckReasons[id] = "";
        initReasons[id] = "";
        initAttachments[id] = null;
        initProposed[id] = {
          accepted: delivered,
          rejected: 0,
          missing: 0,
        };
      }

      setItemActions(initActions);
      setItemDates(initDates);
      setItemAckReasons(initAckReasons);
      setItemDisputeReasons(initReasons);
      setItemAttachments(initAttachments);
      setItemProposedQuantities(initProposed);
      setMode("per_item");
    }
  }, [open, fulfillment, targetLineItemId, initialAction]);

  if (!fulfillment) return null;

  // Filter items that have rejected or missing units
  const allExceptionItems = fulfillment.lineItems.filter(
    (li) => getLineExceptionQty(li) > 0
  );

  // If a specific target line item is selected, focus on it
  const activeItems = targetLineItemId
    ? allExceptionItems.filter((li) => li.purchaseOrderLineItemId === targetLineItemId)
    : allExceptionItems;

  const totalDelivered =
    fulfillment.totalDeliveredQuantity ??
    fulfillment.lineItems.reduce((acc, li) => acc + getLineDeliveredQty(li), 0);

  const totalAccepted =
    fulfillment.totalAcceptedQuantity ??
    fulfillment.lineItems.reduce(
      (acc, li) => acc + (li.quantityAccepted ?? li.quantityReceived ?? 0),
      0
    );

  const totalRejected = targetLineItemId
    ? activeItems.reduce((acc, li) => acc + (li.quantityRejected || 0), 0)
    : fulfillment.totalRejectedQuantity ??
      fulfillment.lineItems.reduce((acc, li) => acc + (li.quantityRejected || 0), 0);

  const totalMissing = targetLineItemId
    ? activeItems.reduce((acc, li) => acc + (li.quantityMissing || 0), 0)
    : fulfillment.totalMissingQuantity ??
      fulfillment.lineItems.reduce((acc, li) => acc + (li.quantityMissing || 0), 0);

  const totalExceptionUnits =
    totalRejected + totalMissing > 0
      ? totalRejected + totalMissing
      : Math.max(0, totalDelivered - totalAccepted);

  const isMultiItem = activeItems.length > 1;
  const isTargetedSingle = !!targetLineItemId && activeItems.length === 1;

  const fulfillmentTitle = fulfillment.receiptNumber
    ? `Receipt ${fulfillment.receiptNumber}${
        fulfillment.fulfillmentReference ? ` (${fulfillment.fulfillmentReference})` : ""
      }`
    : fulfillment.fulfillmentReference
    ? `Shipment #${fulfillmentIndex + 1} (${fulfillment.fulfillmentReference})`
    : `Shipment #${fulfillmentIndex + 1}`;

  // File upload handlers (Negative Test #8: JPEG, PNG, or WebP up to 5 MB)
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

    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.type)) {
      toast.error("Invalid file format. Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error("Image exceeds the 5 MB limit. Please upload a smaller image.");
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

  const isProposedAllocationValid = (li: FulfillmentLineItem): boolean => {
    const id = li.purchaseOrderLineItemId;
    const delivered = getLineDeliveredQty(li);
    const buyerRejected = li.quantityRejected ?? 0;
    const buyerMissing = li.quantityMissing ?? 0;
    const prop = itemProposedQuantities[id];
    if (!prop) return true;
    if (prop.accepted < 0 || prop.rejected < 0 || prop.missing < 0) return false;
    const disputedCount =
      Math.max(0, buyerRejected - prop.rejected) +
      Math.max(0, buyerMissing - prop.missing);
    if (buyerRejected + buyerMissing > 0 && disputedCount <= 0) return false;
    return prop.accepted + prop.rejected + prop.missing === delivered;
  };

  // Validation
  const isValid = () => {
    if (activeItems.length === 0) return false;

    const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0));

    if (mode === "all_same" && !isTargetedSingle) {
      if (globalAction === "backorder") {
        if (!globalDate) return false;
        if (new Date(globalDate) < todayMidnight) return false;
      }
      if (globalAction === "dispute") {
        if (!globalDisputeReason.trim()) return false;
        if (!activeItems.every(isProposedAllocationValid)) return false;
      }
      return true;
    }

    // Per-item validation
    return activeItems.every((li) => {
      const id = li.purchaseOrderLineItemId;
      const act = itemActions[id] || "backorder";
      if (act === "backorder") {
        if (!itemDates[id]) return false;
        if (new Date(itemDates[id]) < todayMidnight) return false;
      }
      if (act === "dispute") {
        if (!itemDisputeReasons[id]?.trim()) return false;
        if (!isProposedAllocationValid(li)) return false;
      }
      return true;
    });
  };

  const handleSubmit = () => {
    const resolutions: LineItemResolution[] = activeItems.map((li) => {
      const id = li.purchaseOrderLineItemId;
      const delivered = getLineDeliveredQty(li);
      const rejectedQty = li.quantityRejected ?? 0;
      const missingQty = li.quantityMissing ?? 0;
      const acceptedQty = li.quantityAccepted ?? li.quantityReceived ?? 0;

      const action =
        mode === "all_same" && !isTargetedSingle
          ? globalAction
          : itemActions[id] || "backorder";
      const date =
        mode === "all_same" && !isTargetedSingle ? globalDate : itemDates[id];
      const ackReason =
        mode === "all_same" && !isTargetedSingle
          ? globalAckReason
          : itemAckReasons[id];
      const disputeReason =
        mode === "all_same" && !isTargetedSingle
          ? globalDisputeReason
          : itemDisputeReasons[id];
      const file =
        mode === "all_same" && !isTargetedSingle
          ? undefined
          : itemAttachments[id] || undefined;

      const prop = itemProposedQuantities[id] ?? {
        accepted: delivered,
        rejected: 0,
        missing: 0,
      };

      return {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId,
        deliveryReceiptLineItemId:
          li.deliveryReceiptLineItemId ||
          li.fulfillmentLineItemId ||
          li.vendorDeliveryNoticeLineItemId,
        vendorDeliveryNoticeLineItemId: li.vendorDeliveryNoticeLineItemId,
        name: li.name,
        quantityAccepted: acceptedQty,
        quantityRejected: rejectedQty || getLineExceptionQty(li),
        quantityMissing: missingQty,
        proposedQuantityAccepted: prop.accepted,
        proposedQuantityRejected: prop.rejected,
        proposedQuantityMissing: prop.missing,
        buyerReason:
          li.exceptionReason || li.rejectionReason || fulfillment.rejectionReason,
        buyerCategory: li.rejectionCategory || fulfillment.rejectionCategory,
        action,
        expectedReadyDate: action === "backorder" ? date : undefined,
        reason:
          action === "backorder" || action === "forfeit"
            ? ackReason?.trim() || undefined
            : undefined,
        disputeReason: action === "dispute" ? disputeReason?.trim() : undefined,
        attachmentName: file?.name,
        attachmentFile: file,
      };
    });

    const hasDispute = resolutions.some((r) => r.action === "dispute");
    const hasAcknowledge = resolutions.some(
      (r) => r.action === "backorder" || r.action === "forfeit"
    );
    const overallStatus: "acknowledged" | "disputed" | "mixed" =
      hasDispute && hasAcknowledge
        ? "mixed"
        : hasDispute
        ? "disputed"
        : "acknowledged";

    onSubmit({
      fulfillmentId: fulfillment.vendorDeliveryNoticeId,
      deliveryReceiptId: fulfillment.deliveryReceiptId,
      shipmentReference:
        fulfillment.shipmentReference || fulfillment.fulfillmentReference || undefined,
      overallStatus,
      resolutions,
      globalAttachmentFile:
        mode === "all_same" && !isTargetedSingle && globalAttachment
          ? globalAttachment
          : undefined,
      notes:
        mode === "all_same" && !isTargetedSingle
          ? globalAction === "dispute"
            ? globalDisputeReason.trim()
            : globalAckReason.trim()
          : undefined,
    });
  };

  // Compute live action counts for footer
  const disputeCount = activeItems.filter(
    (li) =>
      (mode === "all_same" && !isTargetedSingle
        ? globalAction
        : itemActions[li.purchaseOrderLineItemId]) === "dispute"
  ).length;
  const backorderCount = activeItems.filter(
    (li) =>
      (mode === "all_same" && !isTargetedSingle
        ? globalAction
        : itemActions[li.purchaseOrderLineItemId]) === "backorder"
  ).length;
  const forfeitCount = activeItems.filter(
    (li) =>
      (mode === "all_same" && !isTargetedSingle
        ? globalAction
        : itemActions[li.purchaseOrderLineItemId]) === "forfeit"
  ).length;

  const buyerEvidenceList = fulfillment.evidence ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Hidden file input for uploads (JPEG, PNG, WebP up to 5 MB) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
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
            Resolve exception quantities for{" "}
            <span className="font-semibold text-foreground">{fulfillmentTitle}</span>. You have
            one response to backorder, forfeit, or dispute exception items.
          </DialogDescription>
        </div>

        {/* ── Scrollable Body with Generous Clearance ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-12">
          {/* ── Compact Stat Strip ── */}
          <div
            className={cn(
              "grid bg-[#e8f7f5]/80 rounded-xl py-2.5 px-4 border border-[#cbf0eb] text-center",
              totalMissing > 0 ? "grid-cols-4" : "grid-cols-3"
            )}
          >
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
            <div className={cn(totalMissing > 0 && "border-r border-[#cbf0eb]")}>
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Rejected
              </span>
              <p className="text-lg font-bold text-[#e14856]">{totalRejected}</p>
            </div>
            {totalMissing > 0 && (
              <div>
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                  Missing
                </span>
                <p className="text-lg font-bold text-amber-700">{totalMissing}</p>
              </div>
            )}
          </div>

          {/* ── Buyer Inspection Finding Summary Card ── */}
          {(fulfillment.rejectionReason ||
            fulfillment.notes ||
            fulfillment.rejectionCategory ||
            buyerEvidenceList.length > 0 ||
            fulfillment.buyerAttachmentName) && (() => {
            const parsedFinding = parseExceptionReason(fulfillment.rejectionReason || fulfillment.notes);
            const displayCategory =
              fulfillment.rejectionCategory
                ? fulfillment.rejectionCategory.replace(/_/g, " ")
                : parsedFinding.category;
            return (
              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Buyer Inspection Finding</span>
                  </div>
                  {displayCategory && (
                    <span className="font-semibold text-[11px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full capitalize">
                      {displayCategory}
                    </span>
                  )}
                </div>
                {parsedFinding.text && (
                  <p className="text-amber-900 leading-relaxed pl-5.5">
                    {parsedFinding.text}
                  </p>
                )}
                {(buyerEvidenceList.length > 0 ||
                  (fulfillment.vendorEvidence && fulfillment.vendorEvidence.length > 0)) && (
                  <div className="pl-5.5 pt-1.5">
                    <EvidenceGallery
                      buyerEvidence={buyerEvidenceList}
                      vendorEvidence={fulfillment.vendorEvidence}
                    />
                  </div>
                )}
                {fulfillment.buyerAttachmentName && buyerEvidenceList.length === 0 && (
                  <div className="pl-5.5 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md">
                      <FileText className="h-3 w-3 text-amber-700" />
                      {fulfillment.buyerAttachmentName}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Multi-item mode switcher if multiple items have exceptions ── */}
          {isMultiItem && !isTargetedSingle && (
            <div className="bg-muted/40 rounded-xl p-3 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#00b29a]" />
                <span className="text-xs font-semibold text-foreground">
                  {activeItems.length} items have exception quantities
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
                Apply Action to All {totalExceptionUnits} Exception Units
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
                    Close rejected/missing units without replacement.
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
                    Contest buyer findings and submit evidence for review.
                  </p>
                </div>
              </div>

              {/* Backorder Global Date Picker & Optional Reason */}
              {globalAction === "backorder" && (
                <div className="space-y-3 p-4 rounded-xl border border-border bg-white shadow-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground" required>
                      Expected Redelivery Date for All Items
                    </Label>
                    <DatePicker
                      date={globalDate ? new Date(globalDate) : undefined}
                      onSelect={(d) => setGlobalDate(d ? format(d, "yyyy-MM-dd") : "")}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="h-10 w-full bg-white text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Future date when replacement units will be delivered.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">
                      Reason / Note (Optional)
                    </Label>
                    <input
                      type="text"
                      value={globalAckReason}
                      onChange={(e) => setGlobalAckReason(e.target.value)}
                      placeholder="e.g., Replacement units will be delivered on the stated date."
                      className="w-full h-9 rounded-xl border border-border px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                    />
                  </div>
                </div>
              )}

              {/* Forfeit Optional Reason */}
              {globalAction === "forfeit" && (
                <div className="space-y-2 p-4 rounded-xl border border-rose-200 bg-rose-50/40 shadow-xs">
                  <p className="text-xs text-rose-800 font-medium">
                    Forfeited quantities cannot be added to a later fulfillment and are not invoiceable.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-rose-900">
                      Reason (Optional)
                    </Label>
                    <input
                      type="text"
                      value={globalAckReason}
                      onChange={(e) => setGlobalAckReason(e.target.value)}
                      placeholder="e.g., We cannot replace the remaining units."
                      className="w-full h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300"
                    />
                  </div>
                </div>
              )}

              {/* Dispute Global Reason, Proposed Quantities & Upload */}
              {globalAction === "dispute" && (
                <div className="space-y-4 p-4 rounded-xl border border-border bg-white shadow-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground" required>
                      Reason for Dispute
                    </Label>
                    <textarea
                      value={globalDisputeReason}
                      onChange={(e) => setGlobalDisputeReason(e.target.value)}
                      placeholder="Explain why the units comply with the agreed specification..."
                      rows={3}
                      className="w-full rounded-xl border border-border p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20 focus:border-[#00b29a]"
                    />
                  </div>

                  {/* Disputed Units Breakdown per Item */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground">
                      Units Being Disputed
                    </Label>
                    <div className="space-y-2">
                      {activeItems.map((li) => {
                        const id = li.purchaseOrderLineItemId;
                        const delivered = getLineDeliveredQty(li);
                        const buyerAccepted = li.quantityAccepted ?? li.quantityReceived ?? 0;
                        const buyerRejected = li.quantityRejected ?? 0;
                        const buyerMissing = li.quantityMissing ?? 0;
                        const prop = itemProposedQuantities[id] ?? {
                          accepted: delivered,
                          rejected: 0,
                          missing: 0,
                        };
                        const disputedRejected = Math.max(0, buyerRejected - prop.rejected);
                        const disputedMissing = Math.max(0, buyerMissing - prop.missing);
                        const totalDisputedForItem = disputedRejected + disputedMissing;

                        return (
                          <div
                            key={id}
                            className="p-3.5 rounded-xl bg-purple-50/40 border border-purple-200/80 space-y-2.5"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                              <span className="font-semibold text-foreground">{li.name}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {delivered} shipped ({buyerAccepted} accepted
                                {buyerRejected > 0 ? `, ${buyerRejected} rejected` : ""}
                                {buyerMissing > 0 ? `, ${buyerMissing} missing` : ""})
                              </span>
                            </div>
                            <div
                              className={cn(
                                "grid gap-2.5",
                                buyerRejected > 0 && buyerMissing > 0
                                  ? "grid-cols-1 sm:grid-cols-2"
                                  : "grid-cols-1"
                              )}
                            >
                              {buyerRejected > 0 && (
                                <div>
                                  <label className="text-[11px] text-purple-900/90 font-medium block mb-1">
                                    Rejected units to dispute (of {buyerRejected} rejected)
                                  </label>
                                  <DisputeUnitInput
                                    max={buyerRejected}
                                    value={disputedRejected}
                                    onChange={(contestedRej) => {
                                      const newRejected = buyerRejected - contestedRej;
                                      const newAccepted =
                                        buyerAccepted + contestedRej + disputedMissing;
                                      setItemProposedQuantities((prev) => ({
                                        ...prev,
                                        [id]: {
                                          accepted: newAccepted,
                                          rejected: newRejected,
                                          missing: prop.missing,
                                        },
                                      }));
                                    }}
                                    className="w-full h-8.5 rounded-lg border border-purple-200 bg-white px-2.5 text-xs font-medium"
                                  />
                                </div>
                              )}
                              {buyerMissing > 0 && (
                                <div>
                                  <label className="text-[11px] text-purple-900/90 font-medium block mb-1">
                                    Missing units to dispute (of {buyerMissing} missing)
                                  </label>
                                  <DisputeUnitInput
                                    max={buyerMissing}
                                    value={disputedMissing}
                                    onChange={(contestedMis) => {
                                      const newMissing = buyerMissing - contestedMis;
                                      const newAccepted =
                                        buyerAccepted + disputedRejected + contestedMis;
                                      setItemProposedQuantities((prev) => ({
                                        ...prev,
                                        [id]: {
                                          accepted: newAccepted,
                                          rejected: prop.rejected,
                                          missing: newMissing,
                                        },
                                      }));
                                    }}
                                    className="w-full h-8.5 rounded-lg border border-purple-200 bg-white px-2.5 text-xs font-medium"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="text-[11px] text-purple-900 bg-white/80 rounded-lg px-2.5 py-1.5 border border-purple-200/60">
                              Disputing <strong>{totalDisputedForItem}</strong> of{" "}
                              <strong>{buyerRejected + buyerMissing}</strong> flagged units → New
                              proposed total: <strong>{prop.accepted} Accepted</strong> ({buyerAccepted}{" "}
                              already accepted + {totalDisputedForItem} disputed)
                              {prop.rejected > 0 ? ` · ${prop.rejected} Rejected` : ""}
                              {prop.missing > 0 ? ` · ${prop.missing} Missing` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Attachment Box */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">
                      Dispute Evidence Image (Optional)
                    </Label>
                    <div className="p-3 rounded-xl border-2 border-dashed border-[#cbf0eb] bg-[#f0faf8]/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {globalAttachment ? (
                          <LocalFilePreview file={globalAttachment} />
                        ) : (
                          <UploadCloud className="h-5 w-5 text-[#00b29a] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {globalAttachment
                              ? globalAttachment.name
                              : "Upload inspection proof photo"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {globalAttachment
                              ? "Click thumbnail to preview · JPEG, PNG, or WebP"
                              : "JPEG, PNG, or WebP up to 5 MB"}
                          </p>
                        </div>
                      </div>
                      {globalAttachment ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(null)}
                          className="p-1 hover:bg-black/5 rounded-md text-muted-foreground shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleTriggerUpload(null)}
                          className="h-7 text-xs border-[#00b29a] text-[#00b29a] hover:bg-[#00b29a]/10 shrink-0"
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

          {/* ── Mode 2: PER-ITEM CUSTOM CHOICES (Event 2C — Supports Mixed Decisions) ── */}
          {(mode === "per_item" || isTargetedSingle) && (
            <div className="space-y-4">
              {activeItems.length > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Individual Line Item Decisions
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    Choose specific action for each exception line
                  </span>
                </div>
              )}

              {activeItems.map((li) => {
                const id = li.purchaseOrderLineItemId;
                const delivered = getLineDeliveredQty(li);
                const acceptedQty = li.quantityAccepted ?? li.quantityReceived ?? 0;
                const rejectedQty = li.quantityRejected ?? 0;
                const missingQty = li.quantityMissing ?? 0;
                const exceptionQty = getLineExceptionQty(li);
                const currentAction = itemActions[id] || "backorder";
                const currentDate = itemDates[id] || "";
                const currentAckReason = itemAckReasons[id] || "";
                const currentReason = itemDisputeReasons[id] || "";
                const currentAttachment = itemAttachments[id] || null;
                const prop = itemProposedQuantities[id] ?? {
                  accepted: delivered,
                  rejected: 0,
                  missing: 0,
                };
                const disputedRejected = Math.max(0, rejectedQty - prop.rejected);
                const disputedMissing = Math.max(0, missingQty - prop.missing);
                const totalDisputedForItem = disputedRejected + disputedMissing;
                const lineReason = li.exceptionReason || li.rejectionReason;

                return (
                  <div
                    key={id}
                    className="p-5 rounded-2xl border border-border bg-white shadow-xs space-y-4 transition-all"
                  >
                    {/* Item Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{li.name}</span>
                          <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 border border-border px-2 py-0.5 rounded-full">
                            {delivered} shipped
                          </span>
                          {acceptedQty > 0 && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              {acceptedQty} accepted
                            </span>
                          )}
                          {rejectedQty > 0 && (
                            <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full">
                              {rejectedQty} rejected
                            </span>
                          )}
                          {missingQty > 0 && (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              {missingQty} missing
                            </span>
                          )}
                          {rejectedQty === 0 && missingQty === 0 && exceptionQty > 0 && (
                            <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full">
                              {exceptionQty} units rejected
                            </span>
                          )}
                        </div>
                        {lineReason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium text-foreground">Buyer reason: </span>
                            {formatExceptionReason(lineReason)}
                          </p>
                        )}
                      </div>

                      {/* Custom Segmented Pill Selector */}
                      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl border border-border/60 self-start sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setItemActions((prev) => ({ ...prev, [id]: "backorder" }))
                          }
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
                          onClick={() =>
                            setItemActions((prev) => ({ ...prev, [id]: "forfeit" }))
                          }
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
                          onClick={() =>
                            setItemActions((prev) => ({ ...prev, [id]: "dispute" }))
                          }
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

                    {/* Contextual Sub-Card: Backorder Date Picker & Reason */}
                    {currentAction === "backorder" && (
                      <div className="p-3.5 rounded-xl bg-[#f0faf8]/70 border border-[#cbf0eb] space-y-2.5 animate-in fade-in-50 duration-150">
                        <div className="space-y-1.5">
                          <Label
                            className="text-xs font-semibold text-foreground flex items-center gap-1"
                            required
                          >
                            <CalendarIcon className="h-3.5 w-3.5 text-[#00b29a]" />
                            Expected Redelivery Date for {li.name}
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
                            Keep {exceptionQty} units outstanding for a later replacement fulfillment.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-foreground">
                            Reason (Optional)
                          </Label>
                          <input
                            type="text"
                            value={currentAckReason}
                            onChange={(e) =>
                              setItemAckReasons((prev) => ({ ...prev, [id]: e.target.value }))
                            }
                            placeholder={`e.g., Replacement ${li.name} will arrive next week.`}
                            className="w-full h-8.5 rounded-lg border border-[#cbf0eb] bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20"
                          />
                        </div>
                      </div>
                    )}

                    {/* Contextual Sub-Card: Forfeit Explanation & Optional Reason */}
                    {currentAction === "forfeit" && (
                      <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-200/60 text-xs text-rose-900 space-y-2 animate-in fade-in-50 duration-150">
                        <div>
                          <p className="font-semibold flex items-center gap-1.5 text-rose-800">
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            Forfeit {exceptionQty} units of {li.name}
                          </p>
                          <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                            These {exceptionQty} units will be closed without replacement and cannot be invoiced or re-fulfilled.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-rose-900">
                            Reason (Optional)
                          </Label>
                          <input
                            type="text"
                            value={currentAckReason}
                            onChange={(e) =>
                              setItemAckReasons((prev) => ({ ...prev, [id]: e.target.value }))
                            }
                            placeholder="e.g., We cannot replace the remaining units."
                            className="w-full h-8.5 rounded-lg border border-rose-200 bg-white px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-200"
                          />
                        </div>
                      </div>
                    )}

                    {/* Contextual Sub-Card: Dispute Reason, Disputed Units & Proof Upload */}
                    {currentAction === "dispute" && (
                      <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 animate-in fade-in-50 duration-150">
                        <div>
                          <p className="text-xs font-semibold flex items-center gap-1.5 text-purple-900">
                            <ShieldAlert className="h-3.5 w-3.5 text-purple-700" />
                            Dispute {exceptionQty} flagged units of {li.name}
                            <span className="font-normal text-purple-700">
                              ({[
                                rejectedQty > 0 ? `${rejectedQty} rejected` : null,
                                missingQty > 0 ? `${missingQty} missing` : null,
                              ]
                                .filter(Boolean)
                                .join(", ")})
                            </span>
                          </p>
                          <p className="text-[11px] text-purple-700/90 mt-0.5">
                            Ask the buyer to review and accept these flagged units instead of rejecting them.
                          </p>
                        </div>

                        {/* Simple Disputed Unit Inputs (only asks about the rejected/missing units!) */}
                        {(rejectedQty > 0 || missingQty > 0) && (
                          <div className="space-y-2">
                            <div
                              className={cn(
                                "grid gap-2.5",
                                rejectedQty > 0 && missingQty > 0
                                  ? "grid-cols-1 sm:grid-cols-2"
                                  : "grid-cols-1"
                              )}
                            >
                              {rejectedQty > 0 && (
                                <div>
                                  <label className="text-[11px] font-medium text-purple-900 block mb-1">
                                    Rejected units to dispute (out of {rejectedQty} rejected)
                                  </label>
                                  <DisputeUnitInput
                                    max={rejectedQty}
                                    value={disputedRejected}
                                    onChange={(contestedRej) => {
                                      const newRejected = rejectedQty - contestedRej;
                                      const newAccepted =
                                        acceptedQty + contestedRej + disputedMissing;
                                      setItemProposedQuantities((prev) => ({
                                        ...prev,
                                        [id]: {
                                          accepted: newAccepted,
                                          rejected: newRejected,
                                          missing: prop.missing,
                                        },
                                      }));
                                    }}
                                    className="w-full h-8.5 rounded-lg border border-purple-200 bg-white px-2.5 text-xs font-medium"
                                  />
                                </div>
                              )}
                              {missingQty > 0 && (
                                <div>
                                  <label className="text-[11px] font-medium text-purple-900 block mb-1">
                                    Missing units to dispute (out of {missingQty} missing)
                                  </label>
                                  <DisputeUnitInput
                                    max={missingQty}
                                    value={disputedMissing}
                                    onChange={(contestedMis) => {
                                      const newMissing = missingQty - contestedMis;
                                      const newAccepted =
                                        acceptedQty + disputedRejected + contestedMis;
                                      setItemProposedQuantities((prev) => ({
                                        ...prev,
                                        [id]: {
                                          accepted: newAccepted,
                                          rejected: prop.rejected,
                                          missing: newMissing,
                                        },
                                      }));
                                    }}
                                    className="w-full h-8.5 rounded-lg border border-purple-200 bg-white px-2.5 text-xs font-medium"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="text-[11px] text-purple-900 bg-white/80 rounded-lg px-3 py-2 border border-purple-200/70">
                              Disputing <strong>{totalDisputedForItem}</strong> of{" "}
                              <strong>{exceptionQty}</strong> flagged units → Buyer will be asked to
                              accept <strong>{prop.accepted} total units</strong> ({acceptedQty} already
                              accepted + {totalDisputedForItem} disputed)
                              {prop.rejected > 0 ? ` · ${prop.rejected} remain rejected` : ""}
                              {prop.missing > 0 ? ` · ${prop.missing} remain missing` : ""}.
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <Label
                            className="text-xs font-semibold text-purple-900"
                            required
                          >
                            Reason for Disputing {li.name} Finding
                          </Label>
                          <textarea
                            value={currentReason}
                            onChange={(e) =>
                              setItemDisputeReasons((prev) => ({ ...prev, [id]: e.target.value }))
                            }
                            placeholder={`Explain why ${li.name} meets the agreed specification...`}
                            rows={2}
                            className="w-full rounded-xl border border-purple-200 bg-white p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                          />
                        </div>

                        {/* File Upload for this item */}
                        <div className="p-3 rounded-xl border-2 border-dashed border-purple-200 bg-white flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {currentAttachment ? (
                              <LocalFilePreview file={currentAttachment} />
                            ) : (
                              <UploadCloud className="h-4 w-4 text-purple-600 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {currentAttachment
                                  ? currentAttachment.name
                                  : `Attach evidence photo for ${li.name}`}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {currentAttachment
                                  ? "Click thumbnail to preview · JPEG, PNG, or WebP"
                                  : "JPEG, PNG, or WebP up to 5 MB"}
                              </p>
                            </div>
                          </div>
                          {currentAttachment ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(id)}
                              className="p-1 hover:bg-black/5 rounded-md text-muted-foreground shrink-0"
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
                              Attach Photo
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
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
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
