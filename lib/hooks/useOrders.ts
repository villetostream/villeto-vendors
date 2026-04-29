"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrders,
  getOrder,
  acknowledgeOrder,
  markReadyForDelivery,
  markFullDelivery,
  markPartialDelivery,
  fulfillRemainingDelivery,
} from "@/lib/api/orders";
import { useOrgStore, queryKeys } from "@/lib/stores/orgStore";
import { OrderFilters } from "@/lib/types";
import { toast } from "sonner";

export function useOrders(filters: OrderFilters = {}) {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useQuery({
    queryKey: queryKeys.orders(orgId, filters),
    queryFn: () => getOrders(filters),
    enabled: !!orgId,
    staleTime: 1000 * 60, // 1 min
  });
}

export function useOrder(id: string) {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useQuery({
    queryKey: queryKeys.order(orgId, id),
    queryFn: () => getOrder(id),
    enabled: !!orgId && !!id,
  });
}

export function useAcknowledgeOrder() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: string;
      items: { id: string; delivery_date: string }[];
    }) => acknowledgeOrder(id, { items }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders", orgId] });
      queryClient.setQueryData(queryKeys.order(orgId, data.id), data);
      toast.success("Order acknowledged");
    },
    onError: () => toast.error("Failed to acknowledge order"),
  });
}

export function useMarkReadyForDelivery() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: (id: string) => markReadyForDelivery(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders", orgId] });
      queryClient.setQueryData(queryKeys.order(orgId, data.id), data);
      toast.success("Order marked as ready for delivery");
    },
    onError: () => toast.error("Failed to update order"),
  });
}

export function useMarkDelivered() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  const fullMutation = useMutation({
    mutationFn: (id: string) => markFullDelivery(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders", orgId] });
      queryClient.setQueryData(queryKeys.order(orgId, data.id), data);
      toast.success("Delivery confirmed — you can now create an invoice");
    },
    onError: () => toast.error("Failed to mark as delivered"),
  });

  const partialMutation = useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: string;
      items: { id: string; delivered_quantity: number }[];
    }) => markPartialDelivery(id, items),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders", orgId] });
      queryClient.setQueryData(queryKeys.order(orgId, data.id), data);
      toast.success("Partial delivery recorded");
    },
    onError: () => toast.error("Failed to record delivery"),
  });

  return { fullMutation, partialMutation };
}

export function useFulfillDelivery() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: string;
      items: { id: string; delivered_quantity: number }[];
    }) => fulfillRemainingDelivery(id, items),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders", orgId] });
      queryClient.setQueryData(queryKeys.order(orgId, data.id), data);
      toast.success("Remaining delivery fulfilled");
    },
    onError: () => toast.error("Failed to fulfill delivery"),
  });
}
