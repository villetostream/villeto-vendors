"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import Cookies from "js-cookie";
import { AUTH_COOKIE_OPTIONS, AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { ApiEnvelope, CompanyRelationship, CurrentVendor } from "@/lib/types";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { forgotPassword, resetPassword } from "@/lib/api/auth";

interface LoginPayload {
  email: string;
  password: string;
  invitationToken?: string;
}

/**
 * Real shape of POST /vendors/auth/login, matching the switch-company
 * response format backend confirmed (accessToken + currentVendor +
 * companies, plus a legacy-compatible `data` duplicate of currentVendor —
 * kept here in the type for completeness but the frontend now reads only
 * `currentVendor`/`companies`, not the duplicate).
 */
interface LoginResponseData {
  accessToken: string;
  onboardingMode: string;
  currentVendor: CurrentVendor;
  companies: CompanyRelationship[];
  data?: CurrentVendor;
}

type LoginResponse = ApiEnvelope<LoginResponseData>;

export const useLogin = (): UseMutationResult<LoginResponse, Error, LoginPayload> => {
  const setCurrentVendor = useAuthStore((s) => s.setCurrentVendor);
  const setCompanies = useCompanyStore((s) => s.setCompanies);
  const setActive = useCompanyStore((s) => s.setActive);
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, Error, LoginPayload>({
    mutationFn: async (payload: LoginPayload) => {
      const res = await apiClient.post<LoginResponse>("/vendors/auth/login", payload);
      const loginData = res.data;
      const { accessToken, currentVendor, companies } = loginData.data;

      if (accessToken) {
        Cookies.set(AUTH_COOKIE_NAMES.authToken, accessToken, AUTH_COOKIE_OPTIONS);
      }

      // Clear any cached data from a previous session so the new session
      // always fetches fresh data immediately — prevents stale orders/invoices
      // from a different company or user appearing on login.
      queryClient.clear();

      // Find the active company relationship to seed accurate approvalStatus & status immediately
      const activeCo = companies?.find((c) => c.companyId === currentVendor.companyId) || companies?.[0];
      const effOnboarding = activeCo?.onboardingStatus ?? currentVendor.onboardingStatus;
      const effNextAction = (activeCo as any)?.nextAction ?? (currentVendor as any)?.nextAction;
      const isAwaiting =
        (effOnboarding ?? "").toLowerCase() === "submitted" ||
        effNextAction === "awaiting_company_review";

      const effApproval = isAwaiting
        ? "pending"
        : (activeCo?.approvalStatus ?? currentVendor.approvalStatus);
      const effStatus = activeCo?.status ?? currentVendor.status;

      if (effApproval) {
        Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, effApproval, AUTH_COOKIE_OPTIONS);
      }
      if (effStatus) {
        Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, effStatus, AUTH_COOKIE_OPTIONS);
      }
      if (currentVendor.companyId || activeCo?.companyId) {
        Cookies.set(AUTH_COOKIE_NAMES.activeCompanyId, currentVendor.companyId || activeCo!.companyId, AUTH_COOKIE_OPTIONS);
      }
      const effDecisionNote = isAwaiting
        ? null
        : ((activeCo as any)?.decisionNote || (activeCo as any)?.rejectionReason);
      if (effDecisionNote) {
        Cookies.set(AUTH_COOKIE_NAMES.decisionNote, effDecisionNote, AUTH_COOKIE_OPTIONS);
      } else {
        Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
      }

      setCurrentVendor(currentVendor, companies);
      setCompanies(companies);
      setActive(currentVendor.companyId, currentVendor.vendorId);

      return loginData;
    },
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: (email: string) => forgotPassword(email),
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: (payload: { email: string; code: string; newPassword: string }) =>
      resetPassword({
        email: payload.email,
        token: payload.code,
        newPassword: payload.newPassword,
        confirmPassword: payload.newPassword,
      }),
  });
};
