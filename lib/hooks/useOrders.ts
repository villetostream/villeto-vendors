"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrders,
  getOrder,
  acknowledgeOrder,
  markReadyForDelivery,
  createFulfillment,
  dispatchFulfillment,
  getFulfillmentExceptions,
  getFulfillmentException,
  acknowledgeReceiptException,
  acceptFinalDecision,
  disputeReceiptException,
  uploadReceiptEvidence,
} from "@/lib/api/orders";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import {
  AcknowledgeOrderLineItemPayload,
  AcknowledgeOrderPayload,
  AcknowledgeReceiptPayload,
  AcknowledgeReceiptLineItemPayload,
  ReceiptDispositionAllocation,
  CreateFulfillmentPayload,
  DispatchFulfillmentPayload,
  DisputeReceiptPayload,
  DisputeReceiptLineItemPayload,
  FulfillmentExceptionDetail,
  FulfillmentExceptionFilters,
  OrderFilters,
  ReceiptEvidenceItem,
  UnifiedResolutionPayload,
} from "@/lib/types";
import { toast } from "sonner";
// import { format } from "date-fns";

export function useOrders(filters: OrderFilters = {}) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";
  // const dateRange = useCompanyStore((s) => s.dateRange);

  const mergedFilters: OrderFilters = {
    ...filters,
    // TODO: Uncomment when backend supports date filtering (currently causes 400 Bad Request)
    // ...(dateRange?.from && { startDate: format(dateRange.from, "yyyy-MM-dd") }),
    // ...(dateRange?.to && { endDate: format(dateRange.to, "yyyy-MM-dd") }),
  };

  return useQuery({
    queryKey: queryKeys.orders(companyId, mergedFilters),
    queryFn: () => getOrders(mergedFilters),
    enabled: !!companyId,
  });
}

export function useOrder(purchaseOrderId: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.order(companyId, purchaseOrderId),
    queryFn: () => getOrder(purchaseOrderId),
    enabled: !!companyId && !!purchaseOrderId,
    // Poll every 30s only while waiting on a buyer action (receipt confirmation or dispute review)
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (["closed", "cancelled", "delivered", "issued", "acknowledged"].includes(data.status)) {
        return false;
      }
      const hasDisputedReview = data.receiptConfirmations?.some(
        (r) => r.companyActionRequired || r.resolutionStatus === "under_company_review"
      );
      const hasAwaitingReceipt = (data.fulfillments || data.deliveryNotices || []).some(
        (f) => f.dispatchStatus === "dispatched" && (f.status as string) !== "confirmed" && f.status !== "cancelled"
      );
      return hasDisputedReview || hasAwaitingReceipt ? 30000 : false;
    },
  });
}

export function useAcknowledgeOrder() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({ purchaseOrderId, payload }: { purchaseOrderId: string; payload: AcknowledgeOrderPayload }) =>
      acknowledgeOrder(purchaseOrderId, payload),
    onSuccess: (_summary, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      // Acknowledgement returns a summary, not line dates or timeline evidence.
      queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId), exact: true });
      toast.success("Order acknowledged");
    },
    onError: (error) => {
      const message = (error as { message?: string | string[] })?.message;
      toast.error((Array.isArray(message) ? message.join(" ") : message) || "Failed to acknowledge order");
    },
  });
}

export function useMarkReadyForDelivery() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: (purchaseOrderId: string) => markReadyForDelivery(purchaseOrderId),
    onSuccess: (data, purchaseOrderId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      if (data?.purchaseOrderId && data?.poNumber && data?.lineItems) {
        queryClient.setQueryData(queryKeys.order(companyId, data.purchaseOrderId), data);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, purchaseOrderId) });
      }
      toast.success("Order marked as ready for delivery");
    },
    onError: () => toast.error("Failed to update order"),
  });
}

export function useCreateFulfillment() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      payload,
    }: {
      purchaseOrderId: string;
      payload: CreateFulfillmentPayload;
    }) => createFulfillment(purchaseOrderId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.order(companyId, variables.purchaseOrderId),
      });
      toast.success("Fulfillment submitted");
    },
    onError: (error) =>
      toast.error(
        (error as { message?: string }).message ?? "Failed to submit fulfillment"
      ),
  });
}

export function useDispatchFulfillment() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      fulfillmentId,
      payload,
    }: {
      purchaseOrderId: string;
      fulfillmentId: string;
      payload: DispatchFulfillmentPayload;
    }) => dispatchFulfillment(purchaseOrderId, fulfillmentId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.order(companyId, variables.purchaseOrderId),
      });
      toast.success("Fulfillment marked as dispatched");
    },
    onError: (error) =>
      toast.error((error as { message?: string }).message ?? "Failed to mark fulfillment as dispatched"),
  });
}

// ============================================================================
// FULFILLMENT EXCEPTIONS & DELIVERY RECEIPT RESOLUTION HOOKS
// ============================================================================

export function useFulfillmentExceptions(filters: FulfillmentExceptionFilters = {}) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.fulfillmentExceptions(companyId, filters),
    queryFn: () => getFulfillmentExceptions(filters),
    enabled: !!companyId,
  });
}

export function useFulfillmentException(deliveryReceiptId?: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.fulfillmentException(companyId, deliveryReceiptId ?? ""),
    queryFn: () => getFulfillmentException(deliveryReceiptId!),
    enabled: !!companyId && !!deliveryReceiptId,
  });
}

/**
 * Fetches all fulfillment exception receipt details belonging to a specific Purchase Order.
 */
export function useOrderFulfillmentExceptions(purchaseOrderId: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";
  const listQuery = useFulfillmentExceptions({ limit: 100 });

  const matchingReceipts = (listQuery.data ?? []).filter(
    (item) => item.purchaseOrderId === purchaseOrderId
  );

  const detailQueries = useQueries({
    queries: matchingReceipts.map((item) => ({
      queryKey: queryKeys.fulfillmentException(companyId, item.deliveryReceiptId),
      queryFn: () => getFulfillmentException(item.deliveryReceiptId),
      enabled: !!companyId && !!item.deliveryReceiptId,
    })),
  });

  const data: FulfillmentExceptionDetail[] = detailQueries
    .map((q) => q.data)
    .filter((d): d is FulfillmentExceptionDetail => !!d);

  const isLoading = listQuery.isLoading || detailQueries.some((q) => q.isLoading);

  return {
    data,
    listItems: matchingReceipts,
    isLoading,
    refetch: () => {
      listQuery.refetch();
      detailQueries.forEach((q) => q.refetch());
    },
  };
}

export function useAcknowledgeReceiptException() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      deliveryReceiptId,
      payload,
    }: {
      purchaseOrderId: string;
      deliveryReceiptId: string;
      payload: AcknowledgeReceiptPayload;
    }) => acknowledgeReceiptException(purchaseOrderId, deliveryReceiptId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fulfillmentExceptionsList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.fulfillmentException(companyId, variables.deliveryReceiptId),
      });
    },
  });
}

export function useDisputeReceiptException() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      deliveryReceiptId,
      payload,
    }: {
      purchaseOrderId: string;
      deliveryReceiptId: string;
      payload: DisputeReceiptPayload;
    }) => disputeReceiptException(purchaseOrderId, deliveryReceiptId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fulfillmentExceptionsList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.fulfillmentException(companyId, variables.deliveryReceiptId),
      });
    },
  });
}

export function useUploadReceiptEvidence() {
  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      deliveryReceiptId,
      file,
    }: {
      purchaseOrderId: string;
      deliveryReceiptId: string;
      file: File;
    }) => uploadReceiptEvidence(purchaseOrderId, deliveryReceiptId, file),
  });
}

/**
 * Unified mutation that handles all acknowledge tiers and dispute (Events 2A–2D):
 *
 * Tier selection for acknowledge:
 *   - Tier 1: All ack items have same action, no split  → top-level `disposition`
 *   - Tier 3: Multiple items, each with one action       → `lineItems[].disposition`
 *   - Tier 4: Any item has both backorder + forfeit      → `lineItems[].allocations[]`
 *
 * Dispute is always a separate POST to .../dispute after acknowledge (if any ack items exist).
 */
export function useResolveReceiptException() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      deliveryReceiptId,
      resolution,
    }: {
      purchaseOrderId: string;
      deliveryReceiptId: string;
      resolution: UnifiedResolutionPayload;
    }) => {
      const ackItems = resolution.resolutions.filter(
        (r) => r.action === "backorder" || r.action === "forfeit" || r.action === "mixed" as string
      );
      const disputeItems = resolution.resolutions.filter((r) => r.action === "dispute");

      let latestResult: FulfillmentExceptionDetail | null = null;

      // ── STEP 1: Acknowledge (backorder / forfeit) ──
      if (ackItems.length > 0) {
        // Build per-line items payload (Tier 3 / 4) targeting each specific line item by deliveryReceiptLineItemId,
        // so the backend never re-evaluates or conflicts with previously acknowledged items on the same receipt.
        const lineItems: AcknowledgeReceiptLineItemPayload[] = [];

        for (const item of ackItems) {
          const lineId =
            item.deliveryReceiptLineItemId ||
            item.vendorDeliveryNoticeLineItemId ||
            item.purchaseOrderLineItemId;

          const isSplit =
            (item.backorderQuantity ?? 0) > 0 && (item.forfeitQuantity ?? 0) > 0;

          if (isSplit) {
            // ── Tier 4: Split line — use `allocations[]` ──
            const allocations: ReceiptDispositionAllocation[] = [];

            if ((item.backorderQuantity ?? 0) > 0) {
              allocations.push({
                disposition: "backorder",
                quantity: item.backorderQuantity!,
                ...(item.expectedReadyDate
                  ? { expectedRedeliveryDate: item.expectedReadyDate }
                  : {}),
                reason:
                  item.backorderReason?.trim() ||
                  item.reason?.trim() ||
                  "We will replace the rejected units.",
              });
            }

            if ((item.forfeitQuantity ?? 0) > 0) {
              allocations.push({
                disposition: "forfeit",
                quantity: item.forfeitQuantity!,
                reason:
                  item.forfeitReason?.trim() ||
                  item.reason?.trim() ||
                  "We cannot replace the remaining units.",
              });
            }

            lineItems.push({
              deliveryReceiptLineItemId: lineId,
              allocations,
            });
          } else {
            // ── Tier 3: Single action per line ──
            const action = item.action as "backorder" | "forfeit";
            const totalLineExceptions =
              (item.quantityRejected ?? 0) + (item.quantityMissing ?? 0);
            const isPartialQty =
              item.actionQuantity != null &&
              totalLineExceptions > 0 &&
              item.actionQuantity < totalLineExceptions;

            if (isPartialQty) {
              // If only a partial quantity of this line is being acknowledged (e.g. 1 of 2 units),
              // use explicit allocations array with quantity so backend doesn't assume whole line.
              lineItems.push({
                deliveryReceiptLineItemId: lineId,
                allocations: [
                  {
                    disposition: action,
                    quantity: item.actionQuantity!,
                    ...(action === "backorder" && item.expectedReadyDate
                      ? { expectedRedeliveryDate: item.expectedReadyDate }
                      : {}),
                    reason:
                      item.reason?.trim() ||
                      resolution.notes?.trim() ||
                      (action === "backorder"
                        ? "We will replace the rejected units."
                        : "We cannot replace the remaining units."),
                  },
                ],
              });
            } else {
              lineItems.push({
                deliveryReceiptLineItemId: lineId,
                disposition: action,
                ...(action === "backorder" && item.expectedReadyDate
                  ? { expectedRedeliveryDate: item.expectedReadyDate }
                  : {}),
                reason:
                  item.reason?.trim() ||
                  resolution.notes?.trim() ||
                  (action === "backorder"
                    ? "We will replace the rejected units."
                    : "We cannot replace the remaining units."),
              });
            }
          }
        }

        const hasValidLineIds = lineItems.length > 0 && lineItems.every((li) => !!li.deliveryReceiptLineItemId);
        const ackPayload: AcknowledgeReceiptPayload = hasValidLineIds
          ? { lineItems }
          : {
              disposition: ackItems[0].action as "backorder" | "forfeit",
              ...(ackItems[0].action === "backorder" && ackItems[0].expectedReadyDate
                ? { expectedRedeliveryDate: ackItems[0].expectedReadyDate }
                : {}),
              reason:
                ackItems[0].reason?.trim() ||
                resolution.notes?.trim() ||
                "We will replace the rejected units.",
            };

        latestResult = await acknowledgeReceiptException(
          purchaseOrderId,
          deliveryReceiptId,
          ackPayload
        );
      }

      // ── STEP 2: Upload evidence + dispute (if any disputed lines) ──
      if (disputeItems.length > 0) {
        const evidenceList: ReceiptEvidenceItem[] = [];

        // Global attachment (applies to complete receipt — omit purchaseOrderLineItemIds)
        if (resolution.globalAttachmentFile) {
          const uploaded = await uploadReceiptEvidence(
            purchaseOrderId,
            deliveryReceiptId,
            resolution.globalAttachmentFile
          );
          evidenceList.push({
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: uploaded.mimeType,
          });
        }

        // Per-item attachments (identify the PO lines they support)
        for (const item of disputeItems) {
          if (item.attachmentFile && item.attachmentFile !== resolution.globalAttachmentFile) {
            const uploaded = await uploadReceiptEvidence(
              purchaseOrderId,
              deliveryReceiptId,
              item.attachmentFile
            );
            evidenceList.push({
              url: uploaded.url,
              publicId: uploaded.publicId,
              mimeType: uploaded.mimeType,
              purchaseOrderLineItemIds: [item.purchaseOrderLineItemId],
            });
          }
        }

        const combinedReason =
          resolution.notes?.trim() ||
          disputeItems
            .map((d) => d.disputeReason?.trim())
            .filter(Boolean)
            .join(" | ") ||
          "The units comply with the agreed specification.";

        // Explicitly contested dispute lines
        const disputedPayloadItems: DisputeReceiptLineItemPayload[] = disputeItems.map((item) => {
          const lineId =
            item.deliveryReceiptLineItemId ||
            item.vendorDeliveryNoticeLineItemId ||
            item.purchaseOrderLineItemId;
          const totalDeliveredOnLine =
            (item.quantityAccepted ?? 0) +
            (item.quantityRejected ?? 0) +
            (item.quantityMissing ?? 0);
          const proposedAccepted =
            item.proposedQuantityAccepted ?? totalDeliveredOnLine;
          const proposedRejected = item.proposedQuantityRejected ?? 0;
          const proposedMissing = item.proposedQuantityMissing ?? 0;

          return {
            deliveryReceiptLineItemId: lineId,
            quantityAccepted: proposedAccepted,
            quantityRejected: proposedRejected,
            quantityMissing: proposedMissing,
            ...(item.disputeReason?.trim() ? { reason: item.disputeReason.trim() } : {}),
          };
        });

        // Any other exception line still awaiting a response on this receipt must be included
        // with default buyer-inspected quantities to satisfy backend receipt-level dispute validation:
        // "Provide proposed quantities for every exception line still awaiting a response"
        const uncontestedPayloadItems: DisputeReceiptLineItemPayload[] = [];
        if (
          resolution.allAwaitingExceptionLines &&
          resolution.allAwaitingExceptionLines.length > 0
        ) {
          const coveredIds = new Set(
            [
              ...ackItems.map((a) => a.deliveryReceiptLineItemId || a.purchaseOrderLineItemId),
              ...disputeItems.map((d) => d.deliveryReceiptLineItemId || d.purchaseOrderLineItemId),
            ].filter(Boolean)
          );

          for (const rawLine of resolution.allAwaitingExceptionLines) {
            const rawReceiptLineId =
              rawLine.deliveryReceiptLineItemId ||
              (rawLine as any).id ||
              rawLine.purchaseOrderLineItemId;
            const poLineId = rawLine.purchaseOrderLineItemId;

            if (
              (rawReceiptLineId && coveredIds.has(rawReceiptLineId)) ||
              (poLineId && coveredIds.has(poLineId))
            ) {
              continue;
            }

            const accepted = Number(rawLine.quantityAccepted ?? rawLine.quantityReceived ?? 0);
            const rejected = Number(rawLine.quantityRejected ?? 0);
            const missing = Number(rawLine.quantityMissing ?? 0);

            if (rejected > 0 || missing > 0) {
              uncontestedPayloadItems.push({
                deliveryReceiptLineItemId: rawReceiptLineId,
                quantityAccepted: accepted,
                quantityRejected: rejected,
                quantityMissing: missing,
                reason: "Accepted buyer inspection finding",
              });
            }
          }
        }

        const disputePayload: DisputeReceiptPayload = {
          reason: combinedReason,
          lineItems: [...disputedPayloadItems, ...uncontestedPayloadItems],
          ...(evidenceList.length > 0 ? { evidence: evidenceList } : {}),
        };

        latestResult = await disputeReceiptException(
          purchaseOrderId,
          deliveryReceiptId,
          disputePayload
        );
      }

      return latestResult;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fulfillmentExceptionsList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.fulfillmentException(companyId, variables.deliveryReceiptId),
      });

      const ackCount = variables.resolution.resolutions.filter(
        (r) => r.action === "backorder" || r.action === "forfeit"
      ).length;
      const disputeCount = variables.resolution.resolutions.filter(
        (r) => r.action === "dispute"
      ).length;

      if (disputeCount > 0 && ackCount > 0) {
        toast.success(`Resolution submitted: ${ackCount} acknowledged, ${disputeCount} disputed.`);
      } else if (disputeCount > 0) {
        toast.success(`Dispute submitted for ${disputeCount} item${disputeCount > 1 ? "s" : ""}.`);
      } else {
        toast.success(`Acknowledged resolution for ${ackCount} item${ackCount > 1 ? "s" : ""}.`);
      }
    },
    onError: (error) => {
      const err = error as { message?: string; status?: number };
      if (err.status === 409) {
        toast.error(err.message || "A vendor response has already been submitted for this receipt.");
      } else {
        toast.error(err.message || "Failed to submit receipt resolution");
      }
    },
  });
}

/**
 * useAcceptFinalDecision
 *
 * Accepts the company's final decision after a dispute and allocates any remaining
 * rejected/missing units to backorder or forfeit.
 *
 * Uses the same 4-tier payload selection logic as useResolveReceiptException, but
 * calls POST .../accept-final-decision instead of POST .../acknowledge.
 *
 * Trigger condition:
 *   - receipt.finalDecision is set (company reviewed the dispute), AND
 *   - Vendor still has unresolved quantities after company decision
 *     (e.g. finalQuantityRejected > 0 or finalQuantityMissing > 0 on line items).
 */
export function useAcceptFinalDecision() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      deliveryReceiptId,
      resolution,
    }: {
      purchaseOrderId: string;
      deliveryReceiptId: string;
      resolution: UnifiedResolutionPayload;
    }) => {
      // Only backorder / forfeit allocations are valid here — disputes are not sent
      const ackItems = resolution.resolutions.filter(
        (r) => r.action === "backorder" || r.action === "forfeit" || r.action === ("mixed" as string)
      );

      if (ackItems.length === 0) {
        throw new Error("No backorder or forfeit allocations provided for final decision acceptance.");
      }

      // Build per-line items payload (Tier 3 / 4) targeting each specific line item by deliveryReceiptLineItemId,
      // so the backend updates ONLY the specified line item and never re-validates or conflicts with
      // previously acknowledged items on the same receipt (e.g. Business Laptop).
      const lineItems: AcknowledgeReceiptLineItemPayload[] = [];

      for (const item of ackItems) {
        const lineId =
          item.deliveryReceiptLineItemId ||
          item.vendorDeliveryNoticeLineItemId ||
          item.purchaseOrderLineItemId;

        const isSplit =
          (item.backorderQuantity ?? 0) > 0 && (item.forfeitQuantity ?? 0) > 0;

        if (isSplit) {
          // ── Tier 4: Split — use `allocations[]` ──
          const allocations: ReceiptDispositionAllocation[] = [];

          if ((item.backorderQuantity ?? 0) > 0) {
            allocations.push({
              disposition: "backorder",
              quantity: item.backorderQuantity!,
              ...(item.expectedReadyDate
                ? { expectedRedeliveryDate: item.expectedReadyDate }
                : {}),
              reason:
                item.backorderReason?.trim() ||
                item.reason?.trim() ||
                "We will replace the rejected units.",
            });
          }

          if ((item.forfeitQuantity ?? 0) > 0) {
            allocations.push({
              disposition: "forfeit",
              quantity: item.forfeitQuantity!,
              reason:
                item.forfeitReason?.trim() ||
                item.reason?.trim() ||
                "We cannot replace the remaining units.",
            });
          }

          lineItems.push({
            deliveryReceiptLineItemId: lineId,
            allocations,
          });
        } else {
          // ── Tier 3: Single action per line ──
          const action = item.action as "backorder" | "forfeit";
          const totalLineExceptions =
            (item.quantityRejected ?? 0) + (item.quantityMissing ?? 0);
          const isPartialQty =
            item.actionQuantity != null &&
            totalLineExceptions > 0 &&
            item.actionQuantity < totalLineExceptions;

          if (isPartialQty) {
            lineItems.push({
              deliveryReceiptLineItemId: lineId,
              allocations: [
                {
                  disposition: action,
                  quantity: item.actionQuantity!,
                  ...(action === "backorder" && item.expectedReadyDate
                    ? { expectedRedeliveryDate: item.expectedReadyDate }
                    : {}),
                  reason:
                    item.reason?.trim() ||
                    resolution.notes?.trim() ||
                    (action === "backorder"
                      ? "We will replace the rejected units."
                      : "We cannot replace the remaining units."),
                },
              ],
            });
          } else {
            lineItems.push({
              deliveryReceiptLineItemId: lineId,
              disposition: action,
              ...(action === "backorder" && item.expectedReadyDate
                ? { expectedRedeliveryDate: item.expectedReadyDate }
                : {}),
              reason:
                item.reason?.trim() ||
                resolution.notes?.trim() ||
                (action === "backorder"
                  ? "We will replace the rejected units."
                  : "We cannot replace the remaining units."),
            });
          }
        }
      }

      const hasValidLineIds = lineItems.length > 0 && lineItems.every((li) => !!li.deliveryReceiptLineItemId);
      const payload: AcknowledgeReceiptPayload = hasValidLineIds
        ? { lineItems }
        : {
            disposition: ackItems[0].action as "backorder" | "forfeit",
            ...(ackItems[0].action === "backorder" && ackItems[0].expectedReadyDate
              ? { expectedRedeliveryDate: ackItems[0].expectedReadyDate }
              : {}),
            reason:
              ackItems[0].reason?.trim() ||
              resolution.notes?.trim() ||
              "We will replace the rejected units.",
          };

      return acceptFinalDecision(purchaseOrderId, deliveryReceiptId, payload);
    },

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fulfillmentExceptionsList(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.fulfillmentException(companyId, variables.deliveryReceiptId),
      });

      const ackCount = variables.resolution.resolutions.filter(
        (r) => r.action === "backorder" || r.action === "forfeit"
      ).length;
      toast.success(
        `Final decision accepted and ${ackCount} item${ackCount > 1 ? "s" : ""} allocated.`
      );
    },

    onError: (error) => {
      const err = error as { message?: string; status?: number };
      if (err.status === 409) {
        toast.error(err.message || "Final decision has already been accepted for this receipt.");
      } else {
        toast.error(err.message || "Failed to accept final decision");
      }
    },
  });
}
