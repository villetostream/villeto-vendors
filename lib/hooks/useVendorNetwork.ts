"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/stores/companyStore";
import {
  getMyCompanies,
  getMyCompany,
  getOnboardingStatus,
  acceptCompanyInvitation,
  rejectCompanyInvitation,
  saveV2BusinessIdentity,
  submitV2Onboarding,
  verifyVendor,
  getSavedBankAccounts,
  saveV2BankingDetails,
} from "@/lib/api/vendor-network";
import { AcceptCompanyPayload, V2BusinessIdentityPayload, V2VerificationPayload } from "@/lib/types";

// Companies List
export function useMyCompanies(filters: Record<string, string | number> = {}) {
  return useQuery({
    queryKey: queryKeys.v2Companies(filters),
    queryFn: () => getMyCompanies(filters),
  });
}

// Single Company
export function useMyCompany(companyId: string) {
  return useQuery({
    queryKey: queryKeys.v2Company(companyId),
    queryFn: () => getMyCompany(companyId),
    enabled: !!companyId,
  });
}

// Onboarding Status
export function useOnboardingStatus(companyId: string) {
  return useQuery({
    queryKey: queryKeys.v2Onboarding(companyId),
    queryFn: () => getOnboardingStatus(companyId),
    enabled: !!companyId,
  });
}

// Bank Accounts
export function useSavedBankAccounts() {
  return useQuery({
    queryKey: queryKeys.v2BankAccounts(),
    queryFn: getSavedBankAccounts,
  });
}

// Accept Invitation
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, payload }: { companyId: string; payload?: AcceptCompanyPayload }) =>
      acceptCompanyInvitation(companyId, payload),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(companyId) });
    },
  });
}

// Reject Invitation
export function useRejectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => rejectCompanyInvitation(companyId),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(companyId) });
    },
  });
}

// Save Business Identity
export function useSaveV2BusinessIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, payload }: { companyId: string; payload: V2BusinessIdentityPayload }) =>
      saveV2BusinessIdentity(companyId, payload),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Onboarding(companyId) });
    },
  });
}

// Submit Onboarding
export function useSubmitV2Onboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => submitV2Onboarding(companyId),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Onboarding(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Companies() });
    },
  });
}

// Verify Vendor
export function useVerifyVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V2VerificationPayload) => verifyVendor(payload),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Onboarding(payload.companyId) });
    },
  });
}

// Save Banking
export function useSaveV2BankingDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, payload }: { companyId: string; payload: any }) =>
      saveV2BankingDetails(companyId, payload),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Onboarding(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2BankAccounts() });
    },
  });
}

