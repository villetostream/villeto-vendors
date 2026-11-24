"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Trash2,
  History,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import type {
  Order,
  PriceProposalPayload,
} from "@/lib/types";
import {
  usePriceChangeEligibility,
  usePriceChangeDetail,
  useSubmitPriceProposal,
  useResubmitPriceProposal,
  useWithdrawPriceProposal,
} from "@/lib/hooks/usePriceChanges";
import { toast } from "sonner";

interface PriceProposalDrawerProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  initialRequestId?: string | null;
  initialMode?: "create" | "view" | "edit";
}

function formatStatusBadge(status?: string) {
  switch (status) {
    case "pending_review":
      return {
        label: "Pending Buyer Review",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
        icon: Clock,
      };
    case "returned_for_correction":
      return {
        label: "Returned for Correction",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
        icon: RotateCcw,
      };
    case "approved_pending_issue":
      return {
        label: "Approved · Pending PO Reissue",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
        icon: CheckCircle2,
      };
    case "applied":
    case "approved":
      return {
        label: "Approved & Applied",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: CheckCircle2,
      };
    case "rejected":
      return {
        label: "Rejected",
        classes: "bg-red-50 text-red-800 border-red-200",
        icon: AlertCircle,
      };
    case "withdrawn":
      return {
        label: "Withdrawn",
        classes: "bg-slate-50 text-slate-700 border-slate-200",
        icon: History,
      };
    default:
      return {
        label: status ? status.replace(/_/g, " ") : "Unknown",
        classes: "bg-muted text-muted-foreground border-border",
        icon: History,
      };
  }
}

function formatHistoryAction(action: string): string {
  switch (action) {
    case "submitted":
      return "Vendor Submitted Proposal";
    case "policy_approved":
      return "Commercial Policy Approved";
    case "approved_and_issued":
      return "Approved & PO Revision Reissued";
    case "returned_for_correction":
      return "Returned for Correction";
    case "rejected":
      return "Proposal Rejected";
    case "withdrawn":
      return "Proposal Withdrawn by Vendor";
    default:
      return action.replace(/_/g, " ");
  }
}

/**
 * Clean, comma-formatted currency input with currency prefix and no browser spinner arrows.
 */
function CurrencyInput({
  value,
  onChange,
  currency = "NGN",
  placeholder = "0.00",
  disabled = false,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  currency?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const formatWithCommas = (val: string) => {
    if (!val) return "";
    const clean = val.replace(/[^0-9.]/g, "");
    const parts = clean.split(".");
    const intPart = parts[0] ? Number(parts[0]).toLocaleString("en-US") : "";
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  };

  const [displayValue, setDisplayValue] = useState(() => formatWithCommas(value));

  useEffect(() => {
    setDisplayValue(formatWithCommas(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let clean = raw.replace(/[^0-9.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) {
      clean = parts[0] + "." + parts.slice(1).join("");
    }
    if (parts[1] && parts[1].length > 2) {
      clean = parts[0] + "." + parts[1].slice(0, 2);
    }

    setDisplayValue(formatWithCommas(clean));
    onChange(clean);
  };

  const symbol = currency === "NGN" ? "₦" : currency;

  return (
    <div className="relative w-full">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground select-none pointer-events-none">
        {symbol}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full h-10 pl-8 pr-3 rounded-xl border border-border bg-white text-sm font-semibold text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all",
          "disabled:bg-muted disabled:cursor-not-allowed",
          className
        )}
      />
    </div>
  );
}

function PriceProposalContent({
  order,
  initialRequestId,
  initialMode,
  onClose,
}: {
  order: Order;
  initialRequestId: string | null;
  initialMode: "create" | "view" | "edit";
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"create" | "view" | "edit">(
    initialRequestId ? initialMode : "create"
  );
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(initialRequestId);

  // Proposal form state
  const [draftLines, setDraftLines] = useState<
    Record<string, { selected: boolean; quantity: string; price: string }>
  >({});
  const [reason, setReason] = useState("");
  const [showDocsInput, setShowDocsInput] = useState(false);
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [documents, setDocuments] = useState<{ name: string; url: string }[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const idempotencyKey = useRef<string | null>(null);

  // Queries & Mutations
  const { data: eligibility, isLoading: isLoadingEligibility } = usePriceChangeEligibility(
    order.purchaseOrderId,
    true
  );

  const { data: detail, isLoading: isLoadingDetail } = usePriceChangeDetail(
    order.purchaseOrderId,
    selectedRequestId
  );

  const submitMutation = useSubmitPriceProposal(order.purchaseOrderId);
  const resubmitMutation = useResubmitPriceProposal(order.purchaseOrderId);
  const withdrawMutation = useWithdrawPriceProposal(order.purchaseOrderId);

  // Initialize draft when eligibility arrives in create mode (if draft empty)
  const initializedRef = useRef(false);
  if (!initializedRef.current && mode === "create" && eligibility?.lineItems) {
    const initialDraft: Record<string, { selected: boolean; quantity: string; price: string }> = {};
    for (const line of eligibility.lineItems) {
      const pricing = line.currentPricing.find(
        (r) => Number(r.to) > Number(line.protectedQuantity)
      );
      initialDraft[line.purchaseOrderLineItemId] = {
        selected: false,
        quantity: line.eligibleQuantity,
        price: pricing?.unitPrice ?? "",
      };
    }
    setDraftLines(initialDraft);
    initializedRef.current = true;
  }

  const handleStartEdit = () => {
    if (!detail || !eligibility?.lineItems) return;
    setReason(detail.proposal.reason || "");
    setDocuments(detail.proposal.supportingDocuments || []);
    idempotencyKey.current = null;

    const editDraft: Record<string, { selected: boolean; quantity: string; price: string }> = {};
    for (const line of eligibility.lineItems) {
      const existing = detail.proposal.lineItems.find(
        (p) => p.purchaseOrderLineItemId === line.purchaseOrderLineItemId
      );
      const pricing = line.currentPricing.find(
        (r) => Number(r.to) > Number(line.protectedQuantity)
      );
      editDraft[line.purchaseOrderLineItemId] = {
        selected: !!existing,
        quantity: existing?.quantity ?? line.eligibleQuantity,
        price: existing?.proposedUnitPrice ?? pricing?.unitPrice ?? "",
      };
    }
    setDraftLines(editDraft);
    setMode("edit");
  };

  const updateLine = (
    lineId: string,
    change: Partial<{ selected: boolean; quantity: string; price: string }>
  ) => {
    setDraftLines((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] ?? { selected: false, quantity: "", price: "" }),
        ...change,
      },
    }));
  };

  const buildPayload = (): PriceProposalPayload => {
    idempotencyKey.current ??= crypto.randomUUID();
    const selectedLineItems = Object.entries(draftLines)
      .filter(([, v]) => v.selected)
      .map(([purchaseOrderLineItemId, v]) => ({
        purchaseOrderLineItemId,
        quantity: v.quantity.trim(),
        proposedUnitPrice: v.price.trim(),
      }));

    return {
      idempotencyKey: idempotencyKey.current,
      reason: reason.trim(),
      supportingDocuments: documents,
      lineItems: selectedLineItems,
    };
  };

  // Live commitment impact calculated on the fly
  const liveImpact = (() => {
    if (!eligibility?.lineItems) return null;

    let totalDiff = 0;
    let hasSelected = false;

    for (const line of eligibility.lineItems) {
      const draft = draftLines[line.purchaseOrderLineItemId];
      if (!draft?.selected) continue;

      hasSelected = true;
      const qty = Number(draft.quantity) || 0;
      const newPrice = Number(draft.price) || 0;
      const currentUnitPrice = Number(
        line.currentPricing.find((r) => Number(r.to) > Number(line.protectedQuantity))?.unitPrice ?? "0"
      );

      const oldLineTotal = qty * currentUnitPrice;
      const newLineTotal = qty * newPrice;
      totalDiff += newLineTotal - oldLineTotal;
    }

    if (!hasSelected) return null;

    const currentOrderTotal = Number(order.totalAmount || 0);
    const estimatedNewTotal = Math.max(0, currentOrderTotal + totalDiff);

    return {
      difference: totalDiff,
      currentTotal: currentOrderTotal,
      newTotal: estimatedNewTotal,
    };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload.reason) {
      toast.error("Please provide a reason for the price revision.");
      return;
    }
    if (payload.lineItems.length === 0) {
      toast.error("Please select at least one line item to revise.");
      return;
    }
    for (const item of payload.lineItems) {
      if (Number(item.quantity) <= 0 || isNaN(Number(item.quantity))) {
        toast.error("All selected items must have a quantity greater than zero.");
        return;
      }
      if (Number(item.proposedUnitPrice) < 0 || isNaN(Number(item.proposedUnitPrice))) {
        toast.error("Proposed unit price cannot be negative.");
        return;
      }
    }

    try {
      if (mode === "edit" && selectedRequestId && detail) {
        await resubmitMutation.mutateAsync({
          requestId: selectedRequestId,
          payload: {
            ...payload,
            expectedVersion: detail.version,
          },
        });
        setMode("view");
      } else {
        const result = await submitMutation.mutateAsync(payload);
        setSelectedRequestId(result.priceChangeRequestId);
        setMode("view");
      }
    } catch {
      // Handled in mutation
    }
  };

  const handleWithdraw = async () => {
    if (!selectedRequestId || !detail) return;
    try {
      await withdrawMutation.mutateAsync({
        requestId: selectedRequestId,
        expectedVersion: detail.version,
      });
    } catch {
      // Handled in mutation
    }
  };

  const handleAddDocument = () => {
    if (!docName.trim() || !docUrl.trim()) return;
    if (!docUrl.startsWith("https://")) {
      toast.error("Document link must use secure HTTPS (https://...)");
      return;
    }
    if (documents.length >= 10) {
      toast.error("Maximum 10 supporting documents allowed.");
      return;
    }
    setDocuments((prev) => [...prev, { name: docName.trim(), url: docUrl.trim() }]);
    setDocName("");
    setDocUrl("");
  };

  const handleRemoveDocument = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const isFormSubmitting = submitMutation.isPending || resubmitMutation.isPending;

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-dashboard-bg/50">
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-base font-bold text-foreground">
              {mode === "create"
                ? order.status === "issued"
                  ? "Propose Price Revision"
                  : "Request PO Price Amendment"
                : mode === "edit"
                ? order.status === "issued"
                  ? "Correct & Resubmit Price Revision"
                  : "Correct & Resubmit Price Amendment"
                : order.status === "issued"
                ? "Price Revision Proposal"
                : "PO Price Amendment"}
            </DialogTitle>
            <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              {order.poNumber} · Rev {order.revisionNumber ?? 1}
            </span>
            {mode === "view" && detail && (
              (() => {
                const badge = formatStatusBadge(detail.status);
                const Icon = badge.icon;
                return (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium border",
                      badge.classes
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {badge.label}
                  </span>
                );
              })()
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {mode === "create" || mode === "edit"
              ? order.status === "issued"
                ? "Propose adjusted unit prices for buyer approval before acknowledging the order."
                : "Request commercial adjustments for outstanding or backordered quantities."
              : `Submitted on version ${detail?.version ?? 1} · Basis revision ${detail?.basisRevision ?? 1}`}
          </DialogDescription>
        </div>
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
        {/* VIEW MODE */}
        {mode === "view" && (
          <>
            {isLoadingDetail ? (
              <div className="py-12 text-center text-muted-foreground">
                Loading proposal details...
              </div>
            ) : !detail ? (
              <div className="py-8 text-center text-muted-foreground">
                Proposal details not found.
              </div>
            ) : (
              <div className="space-y-5">
                {/* Financial Commitment Impact */}
                <div className="rounded-2xl border border-border p-4 bg-muted/20 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Financial Commitment Impact
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-white border border-border">
                      <span className="text-xs text-muted-foreground">Previous Total</span>
                      <p className="text-sm font-bold text-foreground mt-0.5">
                        {formatCurrency(Number(detail.comparison.previousTotal), detail.comparison.currency)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-border">
                      <span className="text-xs text-muted-foreground">Proposed Total</span>
                      <p className="text-sm font-bold text-foreground mt-0.5">
                        {formatCurrency(Number(detail.comparison.totalAmount), detail.comparison.currency)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-border">
                      <span className="text-xs text-muted-foreground">Commitment Difference</span>
                      <p
                        className={cn(
                          "text-sm font-bold mt-0.5",
                          Number(detail.comparison.difference) > 0
                            ? "text-emerald-700"
                            : Number(detail.comparison.difference) < 0
                            ? "text-amber-700"
                            : "text-foreground"
                        )}
                      >
                        {Number(detail.comparison.difference) > 0 ? "+" : ""}
                        {formatCurrency(Number(detail.comparison.difference), detail.comparison.currency)}
                      </p>
                    </div>
                  </div>
                  {(Number(detail.comparison.taxAmount) > 0 || Number(detail.comparison.previousTaxAmount) > 0) &&
                    detail.comparison.taxAmount !== detail.comparison.previousTaxAmount && (
                    <p className="text-xs text-muted-foreground">
                      Estimated tax recalculated from{" "}
                      {formatCurrency(Number(detail.comparison.previousTaxAmount), detail.comparison.currency)} to{" "}
                      {formatCurrency(Number(detail.comparison.taxAmount), detail.comparison.currency)}.
                    </p>
                  )}
                </div>

                {/* Line Item Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Affected Line Items
                  </h4>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Item Name</th>
                          <th className="px-4 py-2.5 font-medium">Quantity</th>
                          <th className="px-4 py-2.5 font-medium">Proposed Unit Price</th>
                          <th className="px-4 py-2.5 font-medium text-right">Proposed Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detail.comparison.lineItems.map((li) => {
                          const qty = Number(li.quantity) || 1;
                          const prevAmount = Number(li.previousAmount) || 0;
                          const propAmount = Number(li.proposedAmount) || 0;
                          const prevUnitPrice = prevAmount / qty;
                          const lineDelta = propAmount - prevAmount;

                          return (
                            <tr key={li.purchaseOrderLineItemId} className="hover:bg-muted/10">
                              <td className="px-4 py-3 font-medium text-foreground">{li.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{li.quantity} units</td>
                              <td className="px-4 py-3 text-foreground">
                                <span className="font-semibold block">
                                  {formatCurrency(Number(li.proposedUnitPrice), detail.comparison.currency)}
                                </span>
                                {prevUnitPrice > 0 && Math.abs(prevUnitPrice - Number(li.proposedUnitPrice)) > 0.001 && (
                                  <span className="text-[11px] text-muted-foreground block line-through">
                                    was {formatCurrency(prevUnitPrice, detail.comparison.currency)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-semibold text-foreground block">
                                  {formatCurrency(Number(li.proposedAmount), detail.comparison.currency)}
                                </span>
                                {lineDelta !== 0 && (
                                  <span
                                    className={cn(
                                      "text-[11px] font-semibold block",
                                      lineDelta > 0 ? "text-emerald-700" : "text-amber-700"
                                    )}
                                  >
                                    {lineDelta > 0 ? "+" : ""}
                                    {formatCurrency(lineDelta, detail.comparison.currency)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Vendor Justification
                  </h4>
                  <div className="p-3.5 rounded-xl bg-white border border-border text-foreground text-sm whitespace-pre-wrap">
                    {detail.proposal.reason || "No detailed justification text provided."}
                  </div>
                </div>

                {/* Supporting Documents */}
                {detail.proposal.supportingDocuments?.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Supporting Documents
                    </h4>
                    <div className="space-y-1.5">
                      {detail.proposal.supportingDocuments.map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-white text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium text-foreground truncate">{doc.name}</span>
                          </div>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
                          >
                            View Link <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action History Log */}
                {detail.history?.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-foreground hover:bg-muted/20 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        Proposal &amp; Decision Audit History ({detail.history.length})
                      </span>
                      {historyExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    {historyExpanded && (
                      <div className="p-4 pt-1 border-t border-border space-y-3 divide-y divide-border/60">
                        {detail.history.map((entry, idx) => (
                          <div key={idx} className="pt-3 text-xs space-y-1">
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                Version {entry.version} · {formatHistoryAction(entry.action)}
                              </span>
                              <span>{formatDateTime(entry.at)}</span>
                            </div>
                            {entry.reason && (
                              <p className="text-muted-foreground italic">&ldquo;{entry.reason}&rdquo;</p>
                            )}
                            {entry.comparison && (
                              <p className="text-foreground font-medium">
                                Proposed Total:{" "}
                                {formatCurrency(
                                  Number(entry.comparison.totalAmount),
                                  entry.comparison.currency
                                )}{" "}
                                (Diff:{" "}
                                {Number(entry.comparison.difference) > 0 ? "+" : ""}
                                {formatCurrency(
                                  Number(entry.comparison.difference),
                                  entry.comparison.currency
                                )}
                                )
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* CREATE & EDIT MODES */}
        {(mode === "create" || mode === "edit") && (
          <form id="price-proposal-form" onSubmit={handleSubmit} className="space-y-5">
            {isLoadingEligibility ? (
              <div className="py-12 text-center text-muted-foreground">
                Checking price change eligibility...
              </div>
            ) : !eligibility?.eligible ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Order ineligible for price modifications</p>
                  <p className="mt-0.5 text-amber-800">
                    This purchase order cannot accept new price revision proposals under current terms.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Select Items */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Select Items to Revise
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {Object.values(draftLines).filter((d) => d.selected).length} of {eligibility.lineItems.length} selected
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {eligibility.lineItems.map((line) => {
                      const lineDraft = draftLines[line.purchaseOrderLineItemId];
                      const isBlocked =
                        Number(line.eligibleQuantity) <= 0 ||
                        (!!line.activeRequestId && line.activeRequestId !== selectedRequestId);

                      const currentUnitPrice = Number(
                        line.currentPricing.find(
                          (r) => Number(r.to) > Number(line.protectedQuantity)
                        )?.unitPrice ?? "0"
                      );

                      const proposedPrice = Number(lineDraft?.price) || 0;
                      const qty = Number(lineDraft?.quantity) || 0;
                      const unitDiff = proposedPrice - currentUnitPrice;
                      const lineDiff = unitDiff * qty;

                      return (
                        <div
                          key={line.purchaseOrderLineItemId}
                          className={cn(
                            "p-3.5 rounded-xl border transition-all duration-150",
                            lineDraft?.selected
                              ? "border-primary bg-primary/[0.02] shadow-sm"
                              : "border-border bg-white hover:border-border/80",
                            isBlocked && "opacity-60 bg-muted/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Checkbox
                              id={`line-${line.purchaseOrderLineItemId}`}
                              checked={lineDraft?.selected ?? false}
                              disabled={isBlocked}
                              onCheckedChange={(checked) =>
                                updateLine(line.purchaseOrderLineItemId, { selected: checked })
                              }
                              label={
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-foreground text-sm">
                                    {line.name}
                                  </span>
                                  {lineDraft?.selected && unitDiff !== 0 && (
                                    <span
                                      className={cn(
                                        "text-[11px] font-semibold px-2 py-0.2 rounded-md border",
                                        unitDiff > 0
                                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                          : "text-amber-700 bg-amber-50 border-amber-200"
                                      )}
                                    >
                                      {unitDiff > 0 ? "+" : ""}
                                      {formatCurrency(lineDiff, eligibility.currency)}
                                    </span>
                                  )}
                                </div>
                              }
                              description={
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  Current: <strong className="text-foreground font-medium">{formatCurrency(currentUnitPrice, eligibility.currency)}</strong> / unit · {line.eligibleQuantity} units available
                                  {Number(line.protectedQuantity) > 0 && (
                                    <span className="text-emerald-700 ml-1">
                                      ({line.protectedQuantity} units delivered &amp; protected)
                                    </span>
                                  )}
                                </span>
                              }
                            />
                          </div>

                          {lineDraft?.selected && (
                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  Quantity (max {line.eligibleQuantity})
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  max={line.eligibleQuantity}
                                  required
                                  value={lineDraft.quantity}
                                  onChange={(e) =>
                                    updateLine(line.purchaseOrderLineItemId, {
                                      quantity: e.target.value,
                                    })
                                  }
                                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                  New Unit Price ({eligibility.currency})
                                </label>
                                <CurrencyInput
                                  value={lineDraft.price}
                                  currency={eligibility.currency}
                                  onChange={(newPrice) =>
                                    updateLine(line.purchaseOrderLineItemId, {
                                      price: newPrice,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Justification Reason */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Reason for revision <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">{reason.length} / 4000</span>
                  </div>
                  <textarea
                    rows={2}
                    required
                    maxLength={4000}
                    placeholder="Briefly state why this adjustment is requested (e.g. supplier price change, currency fluctuation, updated spec)..."
                    className="w-full rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground transition-all"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                {/* Supporting Documents (Collapsible) */}
                <div className="space-y-2">
                  {!showDocsInput && documents.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowDocsInput(true)}
                      className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add supporting document link (optional)
                    </button>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Supporting Links (Optional)
                        </label>
                        {documents.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setShowDocsInput(false)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Hide
                          </button>
                        )}
                      </div>

                      {documents.length > 0 && (
                        <div className="space-y-1.5">
                          {documents.map((doc, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 rounded-xl border border-border bg-white text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="font-medium text-foreground truncate">{doc.name}</span>
                                <span className="text-muted-foreground truncate">({doc.url})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocument(idx)}
                                className="text-muted-foreground hover:text-red-600 transition-colors p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Label (e.g. Supplier Invoice)"
                          value={docName}
                          onChange={(e) => setDocName(e.target.value)}
                          className="h-9 text-xs"
                        />
                        <Input
                          type="url"
                          placeholder="https://example.com/spec.pdf"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          className="h-9 text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 shrink-0"
                          disabled={!docName.trim() || !docUrl.startsWith("https://") || documents.length >= 10}
                          onClick={handleAddDocument}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Commitment Impact Summary */}
                {liveImpact && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">Net Commitment Impact</span>
                      <span
                        className={cn(
                          "font-bold text-sm",
                          liveImpact.difference > 0
                            ? "text-emerald-700"
                            : liveImpact.difference < 0
                            ? "text-amber-700"
                            : "text-foreground"
                        )}
                      >
                        {liveImpact.difference > 0 ? "+" : ""}
                        {formatCurrency(liveImpact.difference, order.currency)}
                      </span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">Estimated Revised Total</span>
                      <strong className="text-foreground text-sm font-bold">
                        {formatCurrency(liveImpact.newTotal, order.currency)}
                      </strong>
                    </div>
                  </div>
                )}
              </>
            )}
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border bg-dashboard-bg/80 flex items-center justify-between gap-3">
        {mode === "view" && (
          <>
            <div className="flex items-center gap-2">
              {detail?.status === "returned_for_correction" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartEdit}
                >
                  Correct &amp; Resubmit
                </Button>
              )}
              {detail &&
                ["pending_review", "returned_for_correction"].includes(detail.status) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    loading={withdrawMutation.isPending}
                    onClick={handleWithdraw}
                  >
                    Withdraw Request
                  </Button>
                )}
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {(mode === "create" || mode === "edit") && (
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={isFormSubmitting}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                form="price-proposal-form"
                variant="primary"
                size="sm"
                loading={isFormSubmitting}
                disabled={!eligibility?.eligible || isFormSubmitting}
              >
                Submit for Buyer Review
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function PriceProposalDrawer({
  open,
  onClose,
  order,
  initialRequestId = null,
  initialMode = "create",
}: PriceProposalDrawerProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        showClose={false}
        className="p-0 overflow-hidden max-h-[92vh] flex flex-col gap-0 max-w-xl sm:max-w-2xl"
      >
        <PriceProposalContent
          key={`${initialRequestId ?? "new"}:${initialMode}`}
          order={order}
          initialRequestId={initialRequestId}
          initialMode={initialMode}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
