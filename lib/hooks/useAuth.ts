"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import Cookies from "js-cookie";
import { AUTH_COOKIE_OPTIONS, AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { ApiEnvelope, CompanyRelationship, CurrentVendor } from "@/lib/types";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore } from "@/lib/stores/companyStore";

interface LoginPayload {
  email: string;
  password: string;
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

      setCurrentVendor(currentVendor, companies);
      setCompanies(companies);
      setActive(currentVendor.companyId, currentVendor.vendorId);

      return loginData;
    },
  });
};
