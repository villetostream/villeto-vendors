"use client";

import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  AlertCircle,
  XCircle,
  Clock,
  UploadCloud,
  FileText,
  X,
  ShieldAlert,
  Minus,
  Plus,
  CheckCircle2,
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
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { EvidenceGallery, LocalFilePreview } from "@/components/orders/EvidenceGallery";
import { ExpandableText } from "@/components/ui/ExpandableText";
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

function getLineDeliveredQty(li: FulfillmentLineItem): number {
  const accepted = li.quantityAccepted ?? 0;
  const rejected = li.quantityRejected ?? 0;
  const missing = li.quantityMissing ?? 0;
  const sum = accepted + rejected + missing;
  if (sum > 0) return sum;
  return li.quantityReady || li.quantityShipped || li.quantityReceived || 0;
}

function getLineExceptionQty(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): number {
  const rejected = li.quantityRejected ?? 0;
  const missing = li.quantityMissing ?? 0;
  if (rejected + missing > 0) return rejected + missing;

  // Only consider (shipped - received) as an exception if a buyer delivery receipt / inspection actually exists
  const hasReceipt =
    !!fulfillment?.deliveryReceiptId ||
    !!fulfillment?.receiptNumber ||
    fulfillment?.confirmationOutcome === "confirmed_with_exceptions" ||
    (!!fulfillment?.inspectionOutcome && fulfillment.inspectionOutcome !== "awaiting_inspection");

  if (hasReceipt && li.quantityReceived != null) {
    return Math.max(
      0,
      (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0)
    );
  }

  return 0;
}

export function getLineContestedDisputeQty(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): number {
  if (
    !fulfillment?.decisionHistory ||
    fulfillment.finalDecision != null ||
    fulfillment.resolutionStatus === "resolved_after_dispute"
  ) {
    return 0;
  }
  return (
    fulfillment.decisionHistory.reduce((max: number, dh: any) => {
      if (dh.event === "vendor_disputed" && dh.proposedLineItems) {
        const match = dh.proposedLineItems.find(
          (p: any) =>
            p.deliveryReceiptLineItemId === li.deliveryReceiptLineItemId ||
            p.purchaseOrderLineItemId === li.purchaseOrderLineItemId ||
            (p.name && p.name.trim().toLowerCase() === li.name?.trim().toLowerCase())
        );
        if (match) {
          const acceptedDelta = Math.max(
            0,
            (match.quantityAccepted || 0) - (li.quantityAccepted || 0)
          );
          return Math.max(max, acceptedDelta);
        }
      }
      return max;
    }, 0) || 0
  );
}

export function getLineAllocatedQty(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): {
  backorder: number;
  forfeit: number;
  total: number;
} {
  let allocations = li.dispositionAllocations || [];
  if (allocations.length === 0 && fulfillment?.decisionHistory) {
    for (const dh of fulfillment.decisionHistory) {
      const decisions = (dh as any)?.lineDecisions;
      if (Array.isArray(decisions)) {
        const match = decisions.find(
          (ld: any) =>
            ld.deliveryReceiptLineItemId === li.deliveryReceiptLineItemId ||
            ld.purchaseOrderLineItemId === li.purchaseOrderLineItemId
        );
        if (match?.allocations && match.allocations.length > 0) {
          allocations = match.allocations;
          break;
        }
      }
    }
  }
  const backorder = allocations
    .filter((a) => a.disposition === "backorder")
    .reduce((sum, a) => sum + (a.quantity || 0), 0);
  const forfeit = allocations
    .filter((a) => a.disposition === "forfeit")
    .reduce((sum, a) => sum + (a.quantity || 0), 0);
  return { backorder, forfeit, total: backorder + forfeit };
}

export function getLineUnresolvedQty(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): number {
  if (
    li.resolutionStatus === "resolved" ||
    li.resolutionStatus === "resolved_after_dispute" ||
    li.resolutionStatus === "backordered" ||
    li.resolutionStatus === "forfeited" ||
    fulfillment?.resolutionStatus === "resolved_after_dispute" ||
    fulfillment?.finalDecision === "accept_vendor_dispute"
  ) {
    return 0;
  }

  const hasFinalDecision = fulfillment?.finalDecision != null;
  const isFinalDecisionPending =
    hasFinalDecision &&
    (fulfillment.resolutionStatus === "awaiting_vendor_disposition" ||
      li.resolutionStatus === "awaiting_vendor_disposition" ||
      fulfillment.vendorActionRequired === true);

  const excQty = hasFinalDecision
    ? (li.finalQuantityRejected ?? li.quantityRejected ?? 0) +
      (li.finalQuantityMissing ?? li.quantityMissing ?? 0)
    : getLineExceptionQty(li, fulfillment);

  if (excQty === 0) return 0;

  const allocated = getLineAllocatedQty(li, fulfillment).total;

  if (hasFinalDecision || isFinalDecisionPending) {
    // Once a final decision is issued, dispute is concluded. Unresolved is remaining rejected units not yet allocated.
    return Math.max(0, excQty - allocated);
  }

  const contested = getLineContestedDisputeQty(li, fulfillment);
  return Math.max(0, excQty - allocated - contested);
}

export function isLineAlreadyResolved(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): boolean {
  if (
    li.resolutionStatus === "resolved" ||
    li.resolutionStatus === "resolved_after_dispute" ||
    li.resolutionStatus === "backordered" ||
    li.resolutionStatus === "forfeited" ||
    fulfillment?.resolutionStatus === "resolved_after_dispute" ||
    fulfillment?.finalDecision === "accept_vendor_dispute"
  ) {
    return true;
  }

  return getLineUnresolvedQty(li, fulfillment) === 0;
}

export function getLineRecommendedDisposition(
  li: FulfillmentLineItem,
  fulfillment?: Fulfillment | null
): "backorder" | "forfeit" | null {
  if (li.recommendedDisposition) {
    return li.recommendedDisposition;
  }
  if (fulfillment?.decisionHistory && Array.isArray(fulfillment.decisionHistory)) {
    for (const dh of [...fulfillment.decisionHistory].reverse()) {
      if ((dh as any).lineItems && Array.isArray((dh as any).lineItems)) {
        const match = (dh as any).lineItems.find(
          (dhl: any) =>
            dhl.deliveryReceiptLineItemId === li.deliveryReceiptLineItemId ||
            dhl.purchaseOrderLineItemId === li.purchaseOrderLineItemId ||
            (dhl.name && dhl.name.trim().toLowerCase() === li.name?.trim().toLowerCase())
        );
        if (match?.recommendedDisposition) {
          return match.recommendedDisposition;
        }
      }
    }
  }
  return null;
}

/**
 * Compact stepper + numeric input capped dynamically at `max`.
 */
function CappedQtyControl({
  value,
  max,
  onChange,
  accent = "teal",
}: {
  value: number;
  max: number;
  onChange: (val: number) => void;
  accent?: "teal" | "rose" | "purple";
}) {
  const [rawText, setRawText] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setRawText(String(value));
    }
  }, [value, isFocused]);

  const setClamped = (next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setRawText(String(clamped));
    onChange(clamped);
  };

  const borderCls =
    accent === "rose"
      ? "border-rose-200 focus-within:ring-rose-200"
      : accent === "purple"
      ? "border-purple-200 focus-within:ring-purple-200"
      : "border-[#cbf0eb] focus-within:ring-[#00b29a]/20";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={cn(
          "flex items-center rounded-xl border bg-slate-50 p-0.5 focus-within:ring-2",
          borderCls
        )}
      >
        <button
          type="button"
          onClick={() => setClamped(value - 1)}
          disabled={value <= 0}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground hover:bg-white disabled:opacity-40 transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3 w-3" />
        </button>
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
            setClamped(parsed);
          }}
          onChange={(e) => {
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
          className="h-7 w-11 text-center text-xs font-bold bg-white border-x border-border focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setClamped(value + 1)}
          disabled={value >= max}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground hover:bg-white disabled:opacity-40 transition-colors"
          aria-label="Increase quantity"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
        max {max}
      </span>
    </div>
  );
}

interface ItemSplitState {
  activeTab: "acknowledge" | "dispute";
  backorderQty: number;
  forfeitQty: number;
  disputeQty: number;
  backorderDate: string;
  backorderReason: string;
  forfeitReason: string;
  disputeReason: string;
  attachment: File | null;
}

export interface ResolutionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UnifiedResolutionPayload) => void;
  fulfillment: Fulfillment | null;
  fulfillmentIndex?: number;
  targetLineItemId?: string | null;
  initialAction?: VendorResolutionAction;
  isSubmitting?: boolean;
  /**
   * "resolve" (default) — standard acknowledge / dispute flow via POST .../acknowledge + .../dispute
   * "accept-final-decision" — post-dispute acceptance via POST .../accept-final-decision
   *   Dispute tab is hidden; only Backorder and Forfeit are available.
   */
  mode?: "resolve" | "accept-final-decision";
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
  mode = "resolve",
}: ResolutionModalProps) {
  const [itemSplits, setItemSplits] = useState<Record<string, ItemSplitState>>({});

  // Shared details for multi-item receipts so vendors don't repeat the same date/reason on 5 cards
  const [useSharedAckDetails, setUseSharedAckDetails] = useState(true);
  const [sharedBackorderDate, setSharedBackorderDate] = useState("");
  const [sharedBackorderReason, setSharedBackorderReason] = useState(
    "We will replace the rejected units."
  );
  const [sharedForfeitReason, setSharedForfeitReason] = useState(
    "We cannot replace the remaining units."
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeItemForUpload, setActiveItemForUpload] = useState<string | null>(null);

  useEffect(() => {
    if (open && fulfillment) {
      setUseSharedAckDetails(true);
      setSharedBackorderDate("");
      setSharedBackorderReason("We will replace the rejected units.");
      setSharedForfeitReason("We cannot replace the remaining units.");

      const nextSplits: Record<string, ItemSplitState> = {};
      for (const li of fulfillment.lineItems) {
        const id = li.purchaseOrderLineItemId;
        const unresolvedQty = getLineUnresolvedQty(li, fulfillment);
        const allocations = li.dispositionAllocations || [];

        // Pre-select the buyer's suggestion per line (non-binding); an explicit "dispute" entry point wins.
        const recDisposition = getLineRecommendedDisposition(li, fulfillment);
        const seedAction: VendorResolutionAction =
          initialAction === "dispute"
            ? "dispute"
            : recDisposition ?? initialAction;

        nextSplits[id] = {
          activeTab: seedAction === "dispute" ? "dispute" : "acknowledge",
          backorderQty: seedAction === "backorder" ? unresolvedQty : 0,
          forfeitQty: seedAction === "forfeit" ? unresolvedQty : 0,
          disputeQty: seedAction === "dispute" ? unresolvedQty : 0,
          backorderDate: li.expectedRedeliveryDate || "",
          backorderReason:
            allocations.find((a) => a.disposition === "backorder")?.reason ||
            "We will replace the rejected units.",
          forfeitReason:
            allocations.find((a) => a.disposition === "forfeit")?.reason ||
            "We cannot replace the remaining units.",
          disputeReason: li.vendorResponseReason || "",
          attachment: null,
        };
      }
      setItemSplits(nextSplits);
    }
  }, [open, fulfillment, initialAction]);

  if (!fulfillment) return null;

  const allExceptionItems = fulfillment.lineItems.filter(
    (li) => getLineExceptionQty(li) > 0
  );
  const unresolvedExceptionItems = allExceptionItems.filter(
    (li) => !isLineAlreadyResolved(li, fulfillment)
  );
  const alreadyResolvedExceptionItems = allExceptionItems.filter((li) =>
    isLineAlreadyResolved(li, fulfillment)
  );

  const basePool =
    unresolvedExceptionItems.length > 0 ? unresolvedExceptionItems : allExceptionItems;
  const activeItems = targetLineItemId
    ? allExceptionItems.filter((li) => li.purchaseOrderLineItemId === targetLineItemId)
    : basePool;
  const displayedResolvedItems = alreadyResolvedExceptionItems.filter(
    (r) => !activeItems.some((a) => a.purchaseOrderLineItemId === r.purchaseOrderLineItemId)
  );

  const isMultiItem = activeItems.length > 1;

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

  const fulfillmentTitle = fulfillment.receiptNumber
    ? `Receipt ${fulfillment.receiptNumber}${
        fulfillment.fulfillmentReference ? ` (${fulfillment.fulfillmentReference})` : ""
      }`
    : fulfillment.fulfillmentReference
    ? `Shipment #${fulfillmentIndex + 1} (${fulfillment.fulfillmentReference})`
    : `Shipment #${fulfillmentIndex + 1}`;

  // "accept-final-decision" mode: Dispute tab is hidden; only Backorder / Forfeit are available.
  const isFinalDecisionMode = mode === "accept-final-decision";

  const updateItemSplit = (
    id: string,
    unresolvedQty: number,
    updater: (prev: ItemSplitState) => ItemSplitState
  ) => {
    setItemSplits((prev) => {
      const current = prev[id] ?? {
        activeTab: "acknowledge",
        backorderQty: unresolvedQty,
        forfeitQty: 0,
        disputeQty: 0,
        backorderDate: "",
        backorderReason: "We will replace the rejected units.",
        forfeitReason: "We cannot replace the remaining units.",
        disputeReason: "",
        attachment: null,
      };
      return {
        ...prev,
        [id]: updater(current),
      };
    });
  };

  // Bulk preset helper for multi-item receipts
  const applyPresetToAllItems = (preset: "backorder" | "forfeit" | "dispute") => {
    setItemSplits((prev) => {
      const next = { ...prev };
      for (const li of activeItems) {
        const id = li.purchaseOrderLineItemId;
        const unalloc = getLineUnresolvedQty(li, fulfillment);
        const cur = next[id] ?? {
          activeTab: "acknowledge",
          backorderQty: unalloc,
          forfeitQty: 0,
          disputeQty: 0,
          backorderDate: "",
          backorderReason: "We will replace the rejected units.",
          forfeitReason: "We cannot replace the remaining units.",
          disputeReason: "",
          attachment: null,
        };
        next[id] = {
          ...cur,
          activeTab: preset === "dispute" ? "dispute" : "acknowledge",
          backorderQty: preset === "backorder" ? unalloc : 0,
          forfeitQty: preset === "forfeit" ? unalloc : 0,
          disputeQty: preset === "dispute" ? unalloc : 0,
        };
      }
      return next;
    });
  };

  const handleTriggerUpload = (itemId: string) => {
    setActiveItemForUpload(itemId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeItemForUpload) return;

    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.type)) {
      toast.error("Invalid file format. Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error("Image exceeds the 5 MB limit. Please upload a smaller image.");
      return;
    }

    setItemSplits((prev) => ({
      ...prev,
      [activeItemForUpload]: {
        ...prev[activeItemForUpload],
        attachment: file,
      },
    }));
  };

  const handleRemoveFile = (itemId: string) => {
    setItemSplits((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        attachment: null,
      },
    }));
  };

  // Compute totals across all active items
  let totalBackorderUnits = 0;
  let totalForfeitUnits = 0;
  let totalDisputeUnits = 0;
  let totalUnallocatedUnits = 0;

  for (const li of activeItems) {
    const id = li.purchaseOrderLineItemId;
    const targetQty = getLineUnresolvedQty(li, fulfillment);
    const s = itemSplits[id];
    if (!s) continue;
    totalBackorderUnits += s.backorderQty;
    totalForfeitUnits += s.forfeitQty;
    totalDisputeUnits += s.disputeQty;
    totalUnallocatedUnits += Math.max(
      0,
      targetQty - s.backorderQty - s.forfeitQty - s.disputeQty
    );
  }

  const useSharedForAck = isMultiItem && useSharedAckDetails;

  const isValid = (ackOnly = false) => {
    const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0));

    if (ackOnly) {
      if (totalBackorderUnits + totalForfeitUnits <= 0) return false;
    } else {
      if (totalBackorderUnits + totalForfeitUnits + totalDisputeUnits <= 0) return false;
    }

    if (useSharedForAck && totalBackorderUnits > 0) {
      if (!sharedBackorderDate) return false;
      if (new Date(sharedBackorderDate) < todayMidnight) return false;
    }

    for (const li of activeItems) {
      const id = li.purchaseOrderLineItemId;
      const targetQty = getLineUnresolvedQty(li, fulfillment);
      const s = itemSplits[id];
      if (!s) continue;

      if (s.backorderQty + s.forfeitQty + s.disputeQty > targetQty) {
        return false;
      }
      if (!useSharedForAck && s.backorderQty > 0) {
        if (!s.backorderDate) return false;
        if (new Date(s.backorderDate) < todayMidnight) return false;
      }
      if (!ackOnly && s.disputeQty > 0) {
        if (!s.disputeReason.trim()) return false;
      }
    }
    return true;
  };

  const handleSubmit = (ackOnly = false) => {
    const resolutions: LineItemResolution[] = [];

    for (const li of activeItems) {
      const id = li.purchaseOrderLineItemId;
      const s = itemSplits[id];
      if (!s) continue;

      const acceptedQty = li.quantityAccepted ?? li.quantityReceived ?? 0;
      const rejectedQty = li.quantityRejected ?? 0;
      const missingQty = li.quantityMissing ?? 0;
      const excQty = getLineExceptionQty(li);

      const matchedReceiptLi =
        (fulfillment as any)?.lineItems?.find(
          (r: any) =>
            r.deliveryReceiptLineItemId &&
            r.purchaseOrderLineItemId === li.purchaseOrderLineItemId
        ) ||
        (fulfillment as any)?.receiptConfirmations?.[0]?.lineItems?.find(
          (r: any) =>
            r.deliveryReceiptLineItemId &&
            r.purchaseOrderLineItemId === li.purchaseOrderLineItemId
        );

      const lineId =
        li.deliveryReceiptLineItemId ||
        matchedReceiptLi?.deliveryReceiptLineItemId ||
        (matchedReceiptLi as any)?.id ||
        li.fulfillmentLineItemId ||
        li.vendorDeliveryNoticeLineItemId;

      const baseFields = {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId,
        deliveryReceiptLineItemId: lineId,
        vendorDeliveryNoticeLineItemId: li.vendorDeliveryNoticeLineItemId,
        name: li.name,
        quantityAccepted: acceptedQty,
        quantityRejected: rejectedQty || excQty,
        quantityMissing: missingQty,
        buyerReason:
          li.exceptionReason || li.rejectionReason || fulfillment.rejectionReason,
        buyerCategory: li.rejectionCategory || fulfillment.rejectionCategory,
      };

      const effBackorderDate = useSharedForAck ? sharedBackorderDate : s.backorderDate;
      const effBackorderReason = useSharedForAck ? sharedBackorderReason : s.backorderReason;
      const effForfeitReason = useSharedForAck ? sharedForfeitReason : s.forfeitReason;

      const hasSplit = s.backorderQty > 0 && s.forfeitQty > 0;

      if (hasSplit) {
        // ── Tier 4: Split on a single line — emit one entry with both quantities ──
        // The hook will produce lineItems[].allocations[] for this case
        resolutions.push({
          ...baseFields,
          action: "backorder", // primary action label (hook checks both quantities)
          backorderQuantity: s.backorderQty,
          forfeitQuantity: s.forfeitQty,
          expectedReadyDate: effBackorderDate,
          backorderReason: effBackorderReason.trim() || "We will replace the rejected units.",
          forfeitReason: effForfeitReason.trim() || "We cannot replace the remaining units.",
        });
      } else {
        // ── Tier 1 / 3: Single action on this line ──
        if (s.backorderQty > 0) {
          resolutions.push({
            ...baseFields,
            action: "backorder",
            actionQuantity: s.backorderQty,
            expectedReadyDate: effBackorderDate,
            reason: effBackorderReason.trim() || "We will replace the rejected units.",
          });
        }

        if (s.forfeitQty > 0) {
          resolutions.push({
            ...baseFields,
            action: "forfeit",
            actionQuantity: s.forfeitQty,
            reason: effForfeitReason.trim() || "We cannot replace the remaining units.",
          });
        }
      }

      // Dispute allocation (always a separate resolution entry — separate endpoint)
      if (!ackOnly && s.disputeQty > 0) {
        const contestedRejected = Math.min(rejectedQty, s.disputeQty);
        const contestedMissing = Math.min(
          missingQty,
          Math.max(0, s.disputeQty - contestedRejected)
        );
        const proposedAccepted = acceptedQty + s.disputeQty;
        const proposedRejected = Math.max(0, rejectedQty - contestedRejected);
        const proposedMissing = Math.max(0, missingQty - contestedMissing);

        resolutions.push({
          ...baseFields,
          action: "dispute",
          actionQuantity: s.disputeQty,
          proposedQuantityAccepted: proposedAccepted,
          proposedQuantityRejected: proposedRejected,
          proposedQuantityMissing: proposedMissing,
          disputeReason: s.disputeReason.trim(),
          attachmentName: s.attachment?.name,
          attachmentFile: s.attachment || undefined,
        });
      }
    }

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
    });
  };

  const buyerEvidenceList = fulfillment.evidence ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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
        className="p-0 overflow-hidden max-h-[90vh] flex flex-col gap-0 rounded-2xl w-full max-w-3xl lg:max-w-4xl shadow-2xl border border-border"
      >
        {/* ── Compact Header ── */}
        <div className="px-6 pt-4 pb-3.5 border-b border-border bg-white shrink-0">
          <div className="flex items-center justify-between gap-4 pr-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#00b29a]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isFinalDecisionMode ? "Company Final Decision" : "Vendor Inspection Review"}
                </span>
              </div>
              <DialogTitle className="text-lg font-bold text-foreground mt-0.5">
                {isFinalDecisionMode
                  ? "Allocate Remaining Units — Final Decision"
                  : "Review Buyer Inspection Findings"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isFinalDecisionMode
                  ? <>
                      The company has reviewed your dispute on{" "}
                      <span className="font-semibold text-foreground">{fulfillmentTitle}</span>
                      . Decide what happens to the remaining units.
                    </>
                  : <>
                      Resolve rejected units for{" "}
                      <span className="font-semibold text-foreground">{fulfillmentTitle}</span>
                    </>
                }
              </DialogDescription>
            </div>

            {/* Inline Stat Pills in Header to Save Vertical Viewport Space */}
            <div className="flex items-center gap-2 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-border text-center">
                <span className="text-[10px] text-muted-foreground uppercase block leading-none">
                  Dispatched
                </span>
                <span className="font-bold text-sm text-foreground">{totalDelivered}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <span className="text-[10px] text-emerald-700 uppercase block leading-none">
                  Accepted
                </span>
                <span className="font-bold text-sm text-emerald-800">{totalAccepted}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-center">
                <span className="text-[10px] text-red-700 uppercase block leading-none">
                  Rejected
                </span>
                <span className="font-bold text-sm text-[#e14856]">{totalRejected}</span>
              </div>
              {totalMissing > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-800 uppercase block leading-none">
                    Missing
                  </span>
                  <span className="font-bold text-sm text-amber-800">{totalMissing}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/40">

          {/* ── Orientation Sentence: Plain-language context for non-technical vendors ── */}
          <p className="text-xs text-muted-foreground leading-relaxed bg-white/70 border border-border/60 rounded-xl px-4 py-2.5">
            {isFinalDecisionMode ? (() => {
              const remainingUnitsToResolve = activeItems.reduce(
                (acc, li) => acc + getLineUnresolvedQty(li, fulfillment),
                0
              );
              return (
                <>
                  The buyer has concluded their dispute review and made a final ruling. The{" "}
                  <strong className="text-foreground">
                    {remainingUnitsToResolve} unit{remainingUnitsToResolve === 1 ? "" : "s"}
                  </strong>{" "}
                  below require your final allocation — choose to <strong className="text-foreground">Backorder</strong> (send replacement units) or{" "}
                  <strong className="text-foreground">Forfeit</strong> (write off) before this shipment can be closed.
                </>
              );
            })() : (() => {
              const totalExceptions = (totalRejected || 0) + (totalMissing || 0);
              const remainingUnitsToResolve = activeItems.reduce(
                (acc, li) => acc + getLineUnresolvedQty(li, fulfillment),
                0
              );
              const hasPriorResolutions =
                totalExceptions > remainingUnitsToResolve && remainingUnitsToResolve > 0;

              return (
                <>
                  The buyer reported{" "}
                  <strong className="text-foreground">{totalExceptions} units</strong> that
                  couldn't be accepted.{" "}
                  {hasPriorResolutions ? (
                    <>
                      <strong className="text-foreground">
                        {remainingUnitsToResolve} unit{remainingUnitsToResolve === 1 ? "" : "s"}
                      </strong>{" "}
                      still require{remainingUnitsToResolve === 1 ? "s" : ""} resolution (other
                      units were previously resolved or are under buyer review).
                    </>
                  ) : (
                    <>
                      You must decide what happens to these units — resolve this before the order
                      can move forward.
                    </>
                  )}
                </>
              );
            })()}
          </p>

          {/* ── Compact Buyer Inspection Finding Strip ── */}
          {(fulfillment.rejectionReason ||
            fulfillment.notes ||
            fulfillment.rejectionCategory ||
            buyerEvidenceList.length > 0 ||
            fulfillment.buyerAttachmentName ||
            activeItems.some((li) => li.exceptionReason || li.rejectionReason)) &&
            (() => {
              // Focus finding specifically on items currently being resolved / allocated (activeItems),
              // strictly excluding already-resolved items so their reasons do not leak into the active modal finding.
              const activeReasons = Array.from(
                new Set(
                  activeItems
                    .map((li) => (li.exceptionReason || li.rejectionReason)?.trim())
                    .filter(Boolean)
                )
              );
              const activeFindingRaw =
                activeReasons.length > 0
                  ? activeReasons.join(" · ")
                  : displayedResolvedItems.length > 0
                  ? ""
                  : fulfillment.rejectionReason || fulfillment.notes || "";
              const parsedFinding = parseExceptionReason(activeFindingRaw);

              const isMultiItem = activeItems.length > 1;
              const activeItemCategory = !isMultiItem
                ? activeItems[0]?.rejectionCategory?.replace(/_/g, " ") ||
                  (activeItems[0] as any)?.category ||
                  parsedFinding.category
                : null;
              const displayCategory = activeItemCategory;

              return (
                <div className="px-4 py-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-amber-900">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="font-semibold">Buyer Inspection Finding:</span>
                      {isMultiItem ? (
                        <span className="text-amber-950">
                          Exceptions reported on {activeItems.length} items (
                          {(totalRejected || 0) + (totalMissing || 0)} total units). Review item findings below.
                        </span>
                      ) : parsedFinding.text &&
                        (!displayCategory ||
                          !displayCategory.toLowerCase().includes(parsedFinding.text.toLowerCase())) ? (
                        <span className="text-amber-950">{parsedFinding.text}</span>
                      ) : !displayCategory ? (
                        <span className="text-amber-950">Exceptions reported</span>
                      ) : null}
                    </div>
                    {displayCategory && (
                      <span className="font-semibold text-[11px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full capitalize">
                        {displayCategory}
                      </span>
                    )}
                  </div>
                  {(buyerEvidenceList.length > 0 ||
                    (fulfillment.vendorEvidence &&
                      fulfillment.vendorEvidence.length > 0)) && (
                    <div className="pl-6 pt-1">
                      <p className="text-[11px] font-semibold text-amber-950 mb-1.5">
                        Inspection Evidence Photos ({buyerEvidenceList.length})
                      </p>
                      <EvidenceGallery
                        buyerEvidence={buyerEvidenceList}
                        vendorEvidence={fulfillment.vendorEvidence}
                      />
                    </div>
                  )}
                  {fulfillment.buyerAttachmentName && buyerEvidenceList.length === 0 && (
                    <div className="pl-6">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md">
                        <FileText className="h-3 w-3 text-amber-700" />
                        {fulfillment.buyerAttachmentName}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

          {displayedResolvedItems.length > 0 && !targetLineItemId && (
            <div className="p-3 rounded-xl bg-white border border-border text-xs flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold text-foreground">
                Previously Resolved ({displayedResolvedItems.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {displayedResolvedItems.map((resolvedItem) => {
                  const allocations = resolvedItem.dispositionAllocations || [];
                  const allocationDesc =
                    allocations.length > 0
                      ? allocations
                          .map(
                            (a) =>
                              `${a.quantity} ${
                                a.disposition === "backorder" ? "Backordered" : "Forfeited"
                              }`
                          )
                          .join(", ")
                      : resolvedItem.vendorDisposition === "backorder" ||
                        resolvedItem.resolutionStatus === "backordered"
                      ? "Backordered"
                      : resolvedItem.vendorDisposition === "forfeit" ||
                        resolvedItem.resolutionStatus === "forfeited"
                      ? "Forfeited"
                      : "Disputed";
                  return (
                    <span
                      key={resolvedItem.purchaseOrderLineItemId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-border font-medium text-muted-foreground"
                    >
                      <span className="text-foreground font-semibold">{resolvedItem.name}</span>
                      <span>·</span>
                      <span className="text-emerald-700 font-semibold">{allocationDesc}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Multi-Item Quick-Action Bar (Only shown when 2+ items have rejected units) ── */}
          {isMultiItem && (
            <div className="rounded-xl bg-white border border-border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs">
                <Layers className="h-4 w-4 text-[#00b29a] shrink-0" />
                <span className="font-semibold text-foreground">
                  {activeItems.length} items with rejected units
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-muted-foreground mr-1">Set all items to:</span>
                <button
                  type="button"
                  onClick={() => applyPresetToAllItems("backorder")}
                  className="px-2.5 py-1 rounded-lg border border-[#cbf0eb] bg-[#f0faf8] text-[#087f70] font-semibold hover:bg-[#e0f5f1] transition-colors"
                >
                  Backorder All
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetToAllItems("forfeit")}
                  className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 transition-colors"
                >
                  Forfeit All
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetToAllItems("dispute")}
                  className="px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
                >
                  Dispute All
                </button>
              </div>
            </div>
          )}

          {/* ── Per-Item Cards (Side-by-Side Backorder & Forfeit so nothing clips!) ── */}
          <div className="space-y-3">
            {activeItems.map((li) => {
              const id = li.purchaseOrderLineItemId;
              const delivered = getLineDeliveredQty(li);
              const acceptedQty = li.quantityAccepted ?? li.quantityReceived ?? 0;
              const rejectedQty = li.quantityRejected ?? 0;
              const missingQty = li.quantityMissing ?? 0;
              const exceptionQty = getLineExceptionQty(li);
              const unresolvedQty = getLineUnresolvedQty(li, fulfillment);
              const contestedQty = getLineContestedDisputeQty(li, fulfillment);
              const allocated = getLineAllocatedQty(li, fulfillment);
              const lineReason = li.exceptionReason || li.rejectionReason;

              const contestedInDispute = (() => {
                if (!fulfillment?.decisionHistory) return 0;
                return (
                  fulfillment.decisionHistory.reduce((max: number, dh: any) => {
                    if (dh.event === "vendor_disputed" && dh.proposedLineItems) {
                      const match = dh.proposedLineItems.find(
                        (p: any) =>
                          p.deliveryReceiptLineItemId === li.deliveryReceiptLineItemId ||
                          p.purchaseOrderLineItemId === li.purchaseOrderLineItemId ||
                          (p.name && p.name.trim().toLowerCase() === li.name?.trim().toLowerCase())
                      );
                      if (match) {
                        const acceptedDelta = Math.max(
                          0,
                          (match.quantityAccepted || 0) - (li.quantityAccepted || 0)
                        );
                        return Math.max(max, acceptedDelta);
                      }
                    }
                    return max;
                  }, 0) || 0
                );
              })();

              const split = itemSplits[id] ?? {
                activeTab: "acknowledge",
                backorderQty: unresolvedQty,
                forfeitQty: 0,
                disputeQty: 0,
                backorderDate: "",
                backorderReason: "We will replace the rejected units.",
                forfeitReason: "We cannot replace the remaining units.",
                disputeReason: "",
                attachment: null,
              };

              const maxBackorder = Math.max(0, unresolvedQty - split.forfeitQty - split.disputeQty);
              const maxForfeit = Math.max(0, unresolvedQty - split.backorderQty - split.disputeQty);
              const maxDispute = Math.max(0, unresolvedQty - split.backorderQty - split.forfeitQty);

              return (
                <div
                  key={id}
                  className="p-4 rounded-2xl border border-border bg-white shadow-2xs space-y-3.5"
                >
                  {/* Item Header + 2-Group Mode Switcher: [Backorder / Forfeit] vs [Dispute] */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{li.name}</span>
                        <span className="text-[11px] font-medium text-muted-foreground bg-slate-100 border border-border px-2 py-0.5 rounded-full">
                          {delivered} dispatched
                        </span>
                        {acceptedQty > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            {acceptedQty} accepted
                          </span>
                        )}
                        {rejectedQty > 0 && (
                          <span className="text-[11px] font-bold text-[#e14856] bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                            {rejectedQty} rejected{contestedQty > 0 || allocated.total > 0 ? " total" : ""}
                          </span>
                        )}
                        {missingQty > 0 && (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            {missingQty} missing{contestedQty > 0 || allocated.total > 0 ? " total" : ""}
                          </span>
                        )}
                        {contestedQty > 0 && !fulfillment.finalDecision && (
                          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                            {contestedQty} under buyer review
                          </span>
                        )}
                        {fulfillment.finalDecision && (
                          <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            Ruling: {formatFinalDecisionLabel(fulfillment.finalDecision)}
                          </span>
                        )}
                        {allocated.total > 0 && (
                          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            {allocated.total} allocated ({allocated.backorder > 0 ? `${allocated.backorder} backorder` : ""}{allocated.backorder > 0 && allocated.forfeit > 0 ? ", " : ""}{allocated.forfeit > 0 ? `${allocated.forfeit} forfeit` : ""})
                          </span>
                        )}
                        {unresolvedQty > 0 && (
                          <span className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                            {unresolvedQty} {isFinalDecisionMode ? "to allocate" : "awaiting resolution"}
                          </span>
                        )}
                      </div>
                      {isFinalDecisionMode && (
                        <div className="mt-1.5 text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/90 rounded-lg px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-amber-950">Buyer Ruling:</span>
                            <span className="font-semibold">{formatFinalDecisionLabel(fulfillment.finalDecision)}</span>
                            {contestedInDispute > 0 && (
                              <span className="text-amber-800">
                                ({contestedInDispute} unit{contestedInDispute === 1 ? "" : "s"} contested in dispute & upheld)
                              </span>
                            )}
                            {unresolvedQty > contestedInDispute && (
                              <span className="text-amber-800">
                                · {unresolvedQty - contestedInDispute} unit{unresolvedQty - contestedInDispute === 1 ? "" : "s"} had no prior resolution
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-amber-900/80 leading-relaxed">
                            All {unresolvedQty} remaining rejected units now require your final allocation — choose to <strong>Backorder</strong> (send replacements) or <strong>Forfeit</strong> (write off) below.
                          </p>
                        </div>
                      )}
                      {lineReason && (
                        <div className="mt-1 max-w-xl">
                          <ExpandableText
                            prefix="Buyer reason:"
                            prefixClass="text-foreground font-semibold"
                            text={formatExceptionReason(lineReason)}
                            maxLength={90}
                            className="text-muted-foreground text-[11px]"
                          />
                        </div>
                      )}
                    </div>

                    {/* Clean 2-Group Tab Switcher */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-border self-start sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateItemSplit(id, unresolvedQty, (prev) => ({
                            ...prev,
                            activeTab: "acknowledge",
                            backorderQty:
                              prev.backorderQty === 0 &&
                              prev.forfeitQty === 0 &&
                              prev.disputeQty === unresolvedQty
                                ? unresolvedQty
                                : prev.backorderQty,
                            disputeQty:
                              prev.backorderQty === 0 &&
                              prev.forfeitQty === 0 &&
                              prev.disputeQty === unresolvedQty
                                ? 0
                                : prev.disputeQty,
                          }))
                        }
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                          split.activeTab === "acknowledge"
                            ? "bg-white text-foreground shadow-2xs border border-border/60"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Clock className="h-3.5 w-3.5 text-[#00b29a]" />
                        <span>Backorder / Forfeit</span>
                        {split.backorderQty + split.forfeitQty > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[#f0faf8] text-[#087f70] border border-[#cbf0eb]">
                            {split.backorderQty + split.forfeitQty}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateItemSplit(id, unresolvedQty, (prev) => {
                            const rem = Math.max(
                              0,
                              unresolvedQty - prev.backorderQty - prev.forfeitQty
                            );
                            return {
                              ...prev,
                              activeTab: "dispute",
                              backorderQty:
                                prev.backorderQty === unresolvedQty &&
                                prev.forfeitQty === 0 &&
                                prev.disputeQty === 0
                                  ? 0
                                  : prev.backorderQty,
                              disputeQty:
                                prev.backorderQty === unresolvedQty &&
                                prev.forfeitQty === 0 &&
                                prev.disputeQty === 0
                                  ? unresolvedQty
                                  : prev.disputeQty > 0
                                  ? prev.disputeQty
                                  : rem,
                            };
                          })
                        }
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                          split.activeTab === "dispute"
                            ? "bg-white text-purple-800 shadow-2xs border border-purple-200"
                            : "text-muted-foreground hover:text-foreground",
                          isFinalDecisionMode && "hidden"
                        )}
                      >
                        <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                        <span>Dispute</span>
                        {split.disputeQty > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            {split.disputeQty}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Buyer's non-binding recommendation */}
                  {(() => {
                    const rec = getLineRecommendedDisposition(li, fulfillment);
                    if (!rec) return null;
                    const isApplied =
                      rec === "backorder"
                        ? split.backorderQty === unresolvedQty
                        : split.forfeitQty === unresolvedQty;
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs">
                        <p className="text-sky-900 leading-relaxed">
                          <span className="font-semibold">Buyer suggests: </span>
                          <strong className="text-sky-950 font-bold capitalize">
                            {rec === "backorder"
                              ? "Backorder — send replacement units later."
                              : "Forfeit — write off (no replacement needed)."}
                          </strong>{" "}
                          <span className="text-sky-700">
                            This is only a recommendation; you still have the final say and can choose either Backorder or Forfeit.
                          </span>
                        </p>
                        {isApplied ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-sky-800 shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Applied
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateItemSplit(id, unresolvedQty, (prev) => ({
                                ...prev,
                                activeTab: "acknowledge",
                                backorderQty: rec === "backorder" ? unresolvedQty : 0,
                                forfeitQty: rec === "forfeit" ? unresolvedQty : 0,
                                disputeQty: 0,
                              }))
                            }
                            className="px-3 py-1 rounded-lg border border-sky-300 bg-white text-sky-800 font-semibold hover:bg-sky-100 transition-colors shrink-0"
                          >
                            Apply Suggestion
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {split.activeTab === "acknowledge" ? (
                    /* ════════════════════════════════════════════════════════
                       GROUP 1: BACKORDER & FORFEIT SIDE-BY-SIDE (2 Columns)
                       Fits completely on screen with zero vertical clipping!
                       ════════════════════════════════════════════════════════ */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* LEFT COLUMN: BACKORDER */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 transition-all flex flex-col justify-between space-y-3",
                          split.backorderQty > 0
                            ? "border-[#00b29a] bg-[#f0faf8]/50"
                            : "border-border bg-slate-50/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Checkbox
                            checked={split.backorderQty > 0}
                            disabled={split.backorderQty === 0 && maxBackorder === 0}
                            onCheckedChange={(checked) => {
                              updateItemSplit(id, unresolvedQty, (prev) => ({
                                ...prev,
                                backorderQty: checked ? Math.max(1, maxBackorder) : 0,
                              }));
                            }}
                            label={
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-foreground">
                                  Backorder
                                </span>
                                {getLineRecommendedDisposition(li, fulfillment) === "backorder" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                                    Buyer Recommended
                                  </span>
                                )}
                              </div>
                            }
                            description="These units will be sent again in a future delivery. The buyer will wait."
                          />

                          <CappedQtyControl
                            value={split.backorderQty}
                            max={maxBackorder}
                            accent="teal"
                            onChange={(val) =>
                              updateItemSplit(id, unresolvedQty, (prev) => ({
                                ...prev,
                                backorderQty: val,
                              }))
                            }
                          />
                        </div>

                        {split.backorderQty > 0 && !useSharedForAck && (
                          <div className="pt-2.5 border-t border-[#cbf0eb] space-y-2.5 animate-in fade-in duration-150">
                            <div className="space-y-1">
                              <Label
                                className="text-xs font-semibold text-foreground flex items-center gap-1"
                                required
                              >
                                <CalendarIcon className="h-3 w-3 text-[#00b29a]" />
                                Expected Redelivery Date ({split.backorderQty})
                              </Label>
                              <DatePicker
                                date={
                                  split.backorderDate ? new Date(split.backorderDate) : undefined
                                }
                                onSelect={(d) =>
                                  updateItemSplit(id, unresolvedQty, (prev) => ({
                                    ...prev,
                                    backorderDate: d ? format(d, "yyyy-MM-dd") : "",
                                  }))
                                }
                                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                className="h-8.5 w-full bg-white text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-foreground">
                                Backorder Note
                              </Label>
                              <input
                                type="text"
                                value={split.backorderReason}
                                onChange={(e) =>
                                  updateItemSplit(id, unresolvedQty, (prev) => ({
                                    ...prev,
                                    backorderReason: e.target.value,
                                  }))
                                }
                                placeholder="We will replace the rejected units."
                                className="w-full h-8.5 rounded-lg border border-[#cbf0eb] bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* RIGHT COLUMN: FORFEIT */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 transition-all flex flex-col justify-between space-y-3",
                          split.forfeitQty > 0
                            ? "border-rose-400 bg-rose-50/40"
                            : "border-border bg-slate-50/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Checkbox
                            checked={split.forfeitQty > 0}
                            disabled={split.forfeitQty === 0 && maxForfeit === 0}
                            onCheckedChange={(checked) => {
                              updateItemSplit(id, unresolvedQty, (prev) => ({
                                ...prev,
                                forfeitQty: checked ? Math.max(1, maxForfeit) : 0,
                              }));
                            }}
                            label={
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-foreground">
                                  Forfeit
                                </span>
                                {getLineRecommendedDisposition(li, fulfillment) === "forfeit" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                                    Buyer Recommended
                                  </span>
                                )}
                              </div>
                            }
                            description="These units will be written off. No replacement will be sent and they will not be invoiced."
                          />

                          <CappedQtyControl
                            value={split.forfeitQty}
                            max={maxForfeit}
                            accent="rose"
                            onChange={(val) =>
                              updateItemSplit(id, unresolvedQty, (prev) => ({
                                ...prev,
                                forfeitQty: val,
                              }))
                            }
                          />
                        </div>

                        {split.forfeitQty > 0 && !useSharedForAck && (
                          <div className="pt-2.5 border-t border-rose-200/70 space-y-1 animate-in fade-in duration-150">
                            <Label className="text-xs font-semibold text-rose-900">
                              Forfeit Reason ({split.forfeitQty} unit{split.forfeitQty === 1 ? "" : "s"})
                            </Label>
                            <input
                              type="text"
                              value={split.forfeitReason}
                              onChange={(e) =>
                                updateItemSplit(id, unresolvedQty, (prev) => ({
                                  ...prev,
                                  forfeitReason: e.target.value,
                                }))
                              }
                              placeholder="We cannot replace the remaining units."
                              className="w-full h-8.5 rounded-lg border border-rose-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ════════════════════════════════════════════════════════
                       GROUP 2: DISPUTE
                       ════════════════════════════════════════════════════════ */
                    <div
                      className={cn(
                        "rounded-xl border p-3.5 transition-all space-y-3",
                        split.disputeQty > 0
                          ? "border-purple-400 bg-purple-50/40"
                          : "border-border bg-white"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <Checkbox
                          checked={split.disputeQty > 0}
                          disabled={split.disputeQty === 0 && maxDispute === 0}
                          onCheckedChange={(checked) => {
                            updateItemSplit(id, unresolvedQty, (prev) => ({
                              ...prev,
                              disputeQty: checked ? Math.max(1, maxDispute) : 0,
                            }));
                          }}
                          label={
                            <span className="flex items-center gap-1.5 font-bold text-foreground">
                              <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                              Dispute Rejected Units
                            </span>
                          }
                          description={
                            maxDispute > 0
                              ? `You believe the buyer's finding is incorrect. The company will review and make a final decision.`
                              : "Reduce Backorder or Forfeit quantity to dispute units"
                          }
                        />

                        <CappedQtyControl
                          value={split.disputeQty}
                          max={maxDispute}
                          accent="purple"
                          onChange={(val) =>
                            updateItemSplit(id, unresolvedQty, (prev) => ({
                              ...prev,
                              disputeQty: val,
                            }))
                          }
                        />
                      </div>

                      {split.disputeQty > 0 && (
                        <div className="pt-2.5 border-t border-purple-200/70 space-y-2.5 animate-in fade-in duration-150">
                          <div className="text-[11px] text-purple-900 bg-white/80 rounded-lg px-3 py-1.5 border border-purple-200/70">
                            Disputing <strong>{split.disputeQty}</strong> of{" "}
                            <strong>{unresolvedQty}</strong> awaiting units → Buyer will be asked to
                            accept <strong>{acceptedQty + split.disputeQty} total units</strong>.
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-purple-900" required>
                                Dispute Reason
                              </Label>
                              <textarea
                                value={split.disputeReason}
                                onChange={(e) =>
                                  updateItemSplit(id, unresolvedQty, (prev) => ({
                                    ...prev,
                                    disputeReason: e.target.value,
                                  }))
                                }
                                placeholder={`Why do these ${split.disputeQty} units meet specification?`}
                                rows={2}
                                className="w-full rounded-xl border border-purple-200 bg-white p-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-purple-900">
                                Evidence Photo (Optional)
                              </Label>
                              <div className="p-2.5 rounded-xl border border-dashed border-purple-300 bg-white flex items-center justify-between gap-2 h-[54px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  {split.attachment ? (
                                    <LocalFilePreview file={split.attachment} />
                                  ) : (
                                    <UploadCloud className="h-4 w-4 text-purple-600 shrink-0" />
                                  )}
                                  <span className="text-xs text-muted-foreground truncate">
                                    {split.attachment
                                      ? split.attachment.name
                                      : "JPEG, PNG, WebP (max 5 MB)"}
                                  </span>
                                </div>
                                {split.attachment ? (
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
                                    className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50 shrink-0"
                                  >
                                    Upload
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Consolidated Multi-Item Date & Reason Panel (When 2+ items exist so vendor only fills Date/Note ONCE!) ── */}
          {isMultiItem && totalBackorderUnits + totalForfeitUnits > 0 && (
            <div className="rounded-2xl border border-[#cbf0eb] bg-white p-4 space-y-3 shadow-2xs">
              <Checkbox
                checked={useSharedAckDetails}
                onCheckedChange={(checked) => setUseSharedAckDetails(checked)}
                label="Use the same redelivery date and note across all backordered / forfeited items"
                description="Uncheck if different items have different redelivery dates."
              />

              {useSharedAckDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                  {totalBackorderUnits > 0 && (
                    <>
                      <div className="space-y-1">
                        <Label
                          className="text-xs font-semibold text-foreground flex items-center gap-1"
                          required
                        >
                          <CalendarIcon className="h-3.5 w-3.5 text-[#00b29a]" />
                          Expected Redelivery Date ({totalBackorderUnits} backordered units)
                        </Label>
                        <DatePicker
                          date={sharedBackorderDate ? new Date(sharedBackorderDate) : undefined}
                          onSelect={(d) =>
                            setSharedBackorderDate(d ? format(d, "yyyy-MM-dd") : "")
                          }
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          className="h-9 w-full bg-white text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-foreground">
                          Backorder Note
                        </Label>
                        <input
                          type="text"
                          value={sharedBackorderReason}
                          onChange={(e) => setSharedBackorderReason(e.target.value)}
                          placeholder="We will replace the rejected units."
                          className="w-full h-9 rounded-lg border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00b29a]/20"
                        />
                      </div>
                    </>
                  )}
                  {totalForfeitUnits > 0 && (
                    <div
                      className={cn(
                        "space-y-1",
                        totalBackorderUnits > 0 && "sm:col-span-2"
                      )}
                    >
                      <Label className="text-xs font-semibold text-rose-900">
                        Forfeit Reason ({totalForfeitUnits} forfeited units)
                      </Label>
                      <input
                        type="text"
                        value={sharedForfeitReason}
                        onChange={(e) => setSharedForfeitReason(e.target.value)}
                        placeholder="We cannot replace the remaining units."
                        className="w-full h-9 rounded-lg border border-rose-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Fixed Footer with Live Unit Summary & Submit Buttons ── */}
        <div className="px-6 py-3.5 border-t border-border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-foreground">Summary:</span>
            {totalBackorderUnits > 0 && (
              <span className="text-[#087f70] font-semibold bg-[#f0faf8] px-2 py-0.5 rounded-md border border-[#cbf0eb]">
                {totalBackorderUnits} backordered
              </span>
            )}
            {totalForfeitUnits > 0 && (
              <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                {totalForfeitUnits} forfeited
              </span>
            )}
            {totalDisputeUnits > 0 && (
              <span className="text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                {totalDisputeUnits} disputed
              </span>
            )}
            {totalUnallocatedUnits > 0 && (
              <span className="text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                {totalUnallocatedUnits} remaining for later
              </span>
            )}
            {totalBackorderUnits === 0 &&
              totalForfeitUnits === 0 &&
              totalDisputeUnits === 0 && <span>Enter quantities above</span>}
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center flex-wrap">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>

            {totalBackorderUnits + totalForfeitUnits > 0 && totalDisputeUnits > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={!isValid(true) || isSubmitting}
                className="border-[#00b29a] text-[#087f70] hover:bg-[#f0faf8] text-xs font-semibold"
              >
                Send Backorder/Forfeit First ({totalBackorderUnits + totalForfeitUnits})
              </Button>
            )}

            <Button
              type="button"
              variant="primary"
              onClick={() => handleSubmit(false)}
              loading={isSubmitting}
              disabled={!isValid(false) || isSubmitting}
              className="bg-[#00b29a] hover:bg-[#009b86] text-white px-5 shadow-xs font-semibold"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {isFinalDecisionMode
                ? totalBackorderUnits > 0 && totalForfeitUnits > 0
                  ? `Confirm: ${totalBackorderUnits} Replacement · ${totalForfeitUnits} Written Off`
                  : totalBackorderUnits > 0
                  ? `Confirm: Send ${totalBackorderUnits} Replacement Unit${totalBackorderUnits === 1 ? "" : "s"}`
                  : totalForfeitUnits > 0
                  ? `Confirm: Write Off ${totalForfeitUnits} Unit${totalForfeitUnits === 1 ? "" : "s"}`
                  : "Confirm Allocation"
                : totalDisputeUnits > 0 && totalBackorderUnits + totalForfeitUnits === 0
                ? `Submit Dispute (${totalDisputeUnits})`
                : totalBackorderUnits > 0 && totalForfeitUnits > 0 && totalDisputeUnits === 0
                ? `Confirm: ${totalBackorderUnits} Replacement · ${totalForfeitUnits} Written Off`
                : totalBackorderUnits > 0 && totalForfeitUnits === 0 && totalDisputeUnits === 0
                ? `Confirm: Send ${totalBackorderUnits} Replacement Unit${totalBackorderUnits === 1 ? "" : "s"}`
                : totalForfeitUnits > 0 && totalBackorderUnits === 0 && totalDisputeUnits === 0
                ? `Confirm: Write Off ${totalForfeitUnits} Unit${totalForfeitUnits === 1 ? "" : "s"}`
                : `Submit Resolution (${totalBackorderUnits + totalForfeitUnits + totalDisputeUnits})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
