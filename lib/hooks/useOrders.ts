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
  disputeReceiptException,
  uploadReceiptEvidence,
} from "@/lib/api/orders";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import {
  AcknowledgeOrderPayload,
  AcknowledgeReceiptPayload,
  CreateFulfillmentPayload,
  DispatchFulfillmentPayload,
  DisputeReceiptPayload,
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
    refetchInterval: 15000,
  });
}

export function useOrder(purchaseOrderId: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.order(companyId, purchaseOrderId),
    queryFn: () => getOrder(purchaseOrderId),
    enabled: !!companyId && !!purchaseOrderId,
    refetchInterval: 15000, // Poll every 15s for buyer actions (e.g. receipt confirmation)
  });
}

export function useAcknowledgeOrder() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({ purchaseOrderId, payload }: { purchaseOrderId: string; payload?: AcknowledgeOrderPayload }) =>
      acknowledgeOrder(purchaseOrderId, payload),
    onSuccess: (data, variables) => {
      // Invalidate only the orders LIST queries — the detail query key shares
      // the same prefix so a broad invalidate would trigger an unwanted
      // background refetch of the detail and can cause a render error.
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      // Seed the detail cache directly from the mutation response so the UI
      // updates immediately without a round-trip, IF the backend returned it.
      if (data?.purchaseOrderId && data?.poNumber && data?.lineItems) {
        queryClient.setQueryData(queryKeys.order(companyId, data.purchaseOrderId), data);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      }
      toast.success("Order acknowledged");
    },
    onError: () => toast.error("Failed to acknowledge order"),
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
    refetchInterval: 15000,
  });
}

export function useFulfillmentException(deliveryReceiptId?: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.fulfillmentException(companyId, deliveryReceiptId ?? ""),
    queryFn: () => getFulfillmentException(deliveryReceiptId!),
    enabled: !!companyId && !!deliveryReceiptId,
    refetchInterval: 15000,
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
      refetchInterval: 15000,
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
 * Unified mutation that handles Events 2A, 2B, 2C, and 2D:
 * - If backorder/forfeit lines exist: calls POST .../acknowledge first (leaving disputed lines out).
 * - If disputed lines exist: uploads optional evidence files via POST .../evidence, then calls POST .../dispute.
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
        (r) => r.action === "backorder" || r.action === "forfeit"
      );
      const disputeItems = resolution.resolutions.filter((r) => r.action === "dispute");

      let latestResult: FulfillmentExceptionDetail | null = null;

      // Step 1: Acknowledge backorder / forfeit lines first (Events 2A, 2B, 2C)
      if (ackItems.length > 0) {
        const allBackorder =
          disputeItems.length === 0 && ackItems.every((r) => r.action === "backorder");
        const allForfeit =
          disputeItems.length === 0 && ackItems.every((r) => r.action === "forfeit");

        const ackPayload: AcknowledgeReceiptPayload = {
          ...(allBackorder
            ? {
                disposition: "backorder",
                expectedRedeliveryDate: ackItems[0]?.expectedReadyDate,
                reason:
                  ackItems[0]?.reason ||
                  resolution.notes ||
                  "Replacement units will be delivered on the stated date.",
              }
            : allForfeit
            ? {
                disposition: "forfeit",
                reason:
                  ackItems[0]?.reason ||
                  resolution.notes ||
                  "We cannot replace the remaining units.",
              }
            : {}),
          lineItems: ackItems.map((item) => {
            const lineId =
              item.deliveryReceiptLineItemId ||
              item.vendorDeliveryNoticeLineItemId ||
              item.purchaseOrderLineItemId;
            return {
              deliveryReceiptLineItemId: lineId,
              disposition: item.action as "backorder" | "forfeit",
              ...(item.action === "backorder" && item.expectedReadyDate
                ? { expectedRedeliveryDate: item.expectedReadyDate }
                : {}),
              ...(item.reason ? { reason: item.reason } : {}),
            };
          }),
        };

        latestResult = await acknowledgeReceiptException(
          purchaseOrderId,
          deliveryReceiptId,
          ackPayload
        );
      }

      // Step 2: Upload evidence (if any) and submit dispute for disputed lines (Event 2D)
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

        const disputePayload: DisputeReceiptPayload = {
          reason: combinedReason,
          lineItems: disputeItems.map((item) => {
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
          }),
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
