"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPriceChangeEligibility,
  getPriceChangeRequests,
  getPriceChangeRequestDetail,
  previewPriceChangeProposal,
  submitPriceChangeProposal,
  resubmitPriceChangeProposal,
  withdrawPriceChangeProposal,
} from "@/lib/api/orders";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import {
  PriceProposalPayload,
} from "@/lib/types";
import { toast } from "sonner";

export const formatErrorMessage = (error: unknown): string => {
  const err = error as {
    message?: string | string[];
    response?: { data?: { message?: string | string[] } };
  };
  const message = err?.response?.data?.message ?? err?.message;
  return (Array.isArray(message) ? message.join(" ") : message) || "Could not complete this action. Please refresh and try again.";
};

/**
 * Checks whether an order and its line items are eligible for price modification.
 */
export function usePriceChangeEligibility(purchaseOrderId: string, enabled = true) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.priceChangeEligibility(companyId, purchaseOrderId),
    enabled: !!companyId && !!purchaseOrderId && enabled,
    staleTime: 30_000,
    queryFn: () => getPriceChangeEligibility(purchaseOrderId),
  });
}

/**
 * Lists price change proposals for an order (paginated).
 */
export function usePriceChangeRequests(purchaseOrderId: string, page = 1, enabled = true) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.priceChangeList(companyId, purchaseOrderId, page),
    enabled: !!companyId && !!purchaseOrderId && enabled,
    staleTime: 30_000,
    queryFn: () => getPriceChangeRequests(purchaseOrderId, page),
  });
}

/**
 * Loads full audit details and comparisons for a single price change request.
 */
export function usePriceChangeDetail(purchaseOrderId: string, requestId: string | null) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.priceChangeDetail(companyId, purchaseOrderId, requestId ?? ""),
    enabled: !!companyId && !!purchaseOrderId && !!requestId,
    staleTime: 30_000,
    queryFn: () => getPriceChangeRequestDetail(requestId!),
  });
}

/**
 * Mutation: Calculates preview comparison before submission.
 */
export function usePreviewPriceProposal(purchaseOrderId: string) {
  return useMutation({
    mutationFn: (payload: PriceProposalPayload) =>
      previewPriceChangeProposal(purchaseOrderId, payload),
    onError: (error) => toast.error(formatErrorMessage(error)),
  });
}

/**
 * Mutation: Submits a new price change proposal.
 */
export function useSubmitPriceProposal(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: (payload: PriceProposalPayload) =>
      submitPriceChangeProposal(purchaseOrderId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.priceChangeDetail(companyId, purchaseOrderId, result.priceChangeRequestId),
        result
      );
      // Invalidate queries so order page and history update immediately
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.priceChanges(companyId, purchaseOrderId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.order(companyId, purchaseOrderId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.ordersList(companyId),
        }),
      ]);
      toast.success("Price change proposal submitted for buyer review");
    },
    onError: (error) => toast.error(formatErrorMessage(error)),
  });
}

/**
 * Mutation: Resubmits a proposal that was returned for correction.
 */
export function useResubmitPriceProposal(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: PriceProposalPayload & { expectedVersion: number };
    }) => resubmitPriceChangeProposal(requestId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.priceChangeDetail(companyId, purchaseOrderId, result.priceChangeRequestId),
        result
      );
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.priceChanges(companyId, purchaseOrderId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.order(companyId, purchaseOrderId),
          exact: true,
        }),
      ]);
      toast.success("Revised price proposal submitted for review");
    },
    onError: (error) => toast.error(formatErrorMessage(error)),
  });
}

/**
 * Mutation: Withdraws an active price proposal.
 */
export function useWithdrawPriceProposal(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({
      requestId,
      expectedVersion,
    }: {
      requestId: string;
      expectedVersion: number;
    }) => withdrawPriceChangeProposal(requestId, { expectedVersion }),
    onSuccess: (result) => {
      if (result) {
        queryClient.setQueryData(
          queryKeys.priceChangeDetail(companyId, purchaseOrderId, result.priceChangeRequestId),
          result
        );
      }
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.priceChanges(companyId, purchaseOrderId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.order(companyId, purchaseOrderId),
          exact: true,
        }),
      ]);
      toast.success("Price proposal withdrawn");
    },
    onError: (error) => toast.error(formatErrorMessage(error)),
  });
}
