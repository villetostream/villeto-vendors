"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrders,
  getOrder,
  acknowledgeOrder,
  markReadyForDelivery,
  confirmDelivery,
} from "@/lib/api/orders";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { AcknowledgeOrderPayload, ConfirmDeliveryPayload, OrderFilters } from "@/lib/types";
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
    staleTime: 1000 * 60,
  });
}

export function useOrder(purchaseOrderId: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.order(companyId, purchaseOrderId),
    queryFn: () => getOrder(purchaseOrderId),
    enabled: !!companyId && !!purchaseOrderId,
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

/**
 * See lib/api/orders.ts confirmDelivery — endpoint path and payload shape
 * are unconfirmed with backend.
 */
export function useConfirmDelivery() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({ purchaseOrderId, payload }: { purchaseOrderId: string; payload: ConfirmDeliveryPayload }) =>
      confirmDelivery(purchaseOrderId, payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersList(companyId) });
      if (data?.purchaseOrderId && data?.poNumber && data?.lineItems) {
        queryClient.setQueryData(queryKeys.order(companyId, data.purchaseOrderId), data);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.order(companyId, variables.purchaseOrderId) });
      }
      toast.success(
        data?.status === "delivered" ? "Delivery confirmed" : "Partial delivery recorded"
      );
    },
    onError: () => toast.error("Failed to confirm delivery"),
  });
}
