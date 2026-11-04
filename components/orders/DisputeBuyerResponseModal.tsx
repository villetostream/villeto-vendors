"use client";

import React, { useState, useRef, useEffect } from "react";
import { UploadCloud, FileText, X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/Checkbox";
import type {
  Fulfillment,
  FulfillmentLineItem,
  DisputeResolutionPayload,
} from "@/lib/types";

interface DisputeBuyerResponseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DisputeResolutionPayload) => void;
  fulfillment: Fulfillment | null;
  fulfillmentIndex?: number;
  isSubmitting?: boolean;
  onSwitchToAcknowledge?: () => void;
}

export function DisputeBuyerResponseModal({
  open,
  onClose,
  onSubmit,
  fulfillment,
  fulfillmentIndex = 0,
  isSubmitting = false,
  onSwitchToAcknowledge,
}: DisputeBuyerResponseModalProps) {
  const [disputeReason, setDisputeReason] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setDisputeReason("");
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (fulfillment) {
        // By default select all rejected line items
        const rejectedIds = fulfillment.lineItems
          .filter((li) => {
            const rejected = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
            return rejected > 0;
          })
          .map((li) => li.purchaseOrderLineItemId);
        setSelectedItemIds(rejectedIds);
      }
    }
  }, [open, fulfillment]);

  if (!fulfillment) return null;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File exceeds 10MB limit. Please upload a smaller file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setAttachedFile(file);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isValid = () => {
    if (!disputeReason.trim()) return false;
    if (isMultiItem && selectedItemIds.length === 0) return false;
    return true;
  };

  const handleSubmit = () => {
    onSubmit({
      fulfillmentId: fulfillment.vendorDeliveryNoticeId,
      shipmentReference: fulfillment.shipmentReference || fulfillment.fulfillmentReference || undefined,
      disputeReason: disputeReason.trim(),
      attachmentName: attachedFile?.name,
      attachmentFile: attachedFile || undefined,
      lineItemIds: isMultiItem ? selectedItemIds : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl" className="p-0 overflow-hidden max-h-[88vh] flex flex-col gap-0 rounded-2xl max-w-2xl sm:max-w-3xl">
        {/* ── Fixed Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground">
            Dispute Buyer&apos;s Response
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-0.5">
            You&apos;re disputing the buyer&apos;s response for{" "}
            <span className="font-medium text-foreground">{fulfillmentTitle}</span>.
          </DialogDescription>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
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

          {/* ── Subtitle notification note (Matching Screenshot 4) ── */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            The buyer will review your dispute and reconfirm the delivery quantity.
          </p>

          {/* ── Buyer's Finding Context ── */}
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
                  Attachment from buyer: <span className="underline">{fulfillment.buyerAttachmentName}</span>
                </p>
              )}
            </div>
          )}

          {/* ── Multi-item selector if multiple items are rejected ── */}
          {isMultiItem && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Select items to dispute ({selectedItemIds.length} of {rejectedItems.length} selected):
              </Label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {rejectedItems.map((li) => {
                  const id = li.purchaseOrderLineItemId;
                  const itemRejected = li.quantityRejected ?? Math.max(0, (li.quantityReady || li.quantityShipped || 0) - (li.quantityReceived || 0));
                  const isChecked = selectedItemIds.includes(id);

                  return (
                    <div
                      key={id}
                      onClick={() => toggleItemSelection(id)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-colors",
                        isChecked
                          ? "border-[#00b29a] bg-[#f0faf8]"
                          : "border-border bg-white hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleItemSelection(id)}
                        />
                        <span className="font-medium text-foreground">{li.name}</span>
                      </div>
                      <span className="text-[11px] font-semibold text-[#e14856]">
                        {itemRejected} rejected
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Enter Reason for Dispute (Required) ── */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-foreground" required>
              Enter Reason for Dispute
            </Label>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Write note here......."
              rows={4}
              disabled={isSubmitting}
              className={cn(
                "w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground",
                "placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2",
                "focus:ring-primary/20 focus:border-primary transition-all"
              )}
            />
          </div>

          {/* ── Add attachment box (Matching Screenshot 4) ── */}
          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
              disabled={isSubmitting}
            />

            {!attachedFile ? (
              <div className="border border-dashed border-[#00b29a] rounded-xl p-3.5 flex items-center justify-between bg-[#f0faf8]/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#00b29a]/30 flex items-center justify-center shrink-0 shadow-xs">
                    <UploadCloud className="w-4 h-4 text-[#00b29a]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Add attachment</p>
                    <p className="text-[11px] text-muted-foreground">PDF, JPG or PNG (max. 10MB)</p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="h-8 px-3 text-xs font-medium border-[#00b29a] text-[#00b29a] hover:bg-[#00b29a]/10"
                >
                  upload
                </Button>
              </div>
            ) : (
              <div className="border border-[#00b29a] rounded-xl p-3 flex items-center justify-between bg-[#f0faf8]">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <FileText className="w-4 h-4 text-[#00b29a] shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">
                    {attachedFile.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    ({(attachedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={isSubmitting}
                  className="p-1 hover:bg-black/5 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* ── Switch to Acknowledge Link ── */}
          {onSwitchToAcknowledge && (
            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Want to accept the buyer&apos;s decision instead?{" "}
                <button
                  type="button"
                  onClick={onSwitchToAcknowledge}
                  className="text-primary font-semibold hover:underline"
                >
                  Acknowledge Response
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
            Submit Dispute
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
