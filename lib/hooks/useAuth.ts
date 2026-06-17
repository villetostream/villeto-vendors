"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import Cookies from "js-cookie";
import { AUTH_COOKIE_OPTIONS, AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

interface LoginPayload {
  email: string;
  password: string;
}

// Map the specific backend response structure
interface LoginResponse {
  message: string;
  status: number;
  data: {
    accessToken: string;
    data: {
      vendorId: string;
      email: string;
      legalName: string;
      displayName: string;
      onboardingStatus: string;
      approvalStatus: string;
      decisionNote?: string | null;
      status: string;
      isPaymentEnabled: boolean;
      currentStep: string;
      businessIdentity: Record<string, unknown>;
      bankingDetails: Record<string, unknown>;
      documents: Record<string, unknown>;
    };
  };
}

export const useLogin = (): UseMutationResult<LoginResponse, Error, LoginPayload> => {
  return useMutation<LoginResponse, Error, LoginPayload>({
    mutationFn: async (payload: LoginPayload) => {
      const res = await apiClient.post<LoginResponse>("/vendors/auth/login", payload);
      const loginData = res.data;

      // Ensure we extract the token exactly as structured in the backend response
      const token = loginData?.data?.accessToken;
      if (token) {
        Cookies.set(AUTH_COOKIE_NAMES.authToken, token, AUTH_COOKIE_OPTIONS);
      }

      const approvalStatus = loginData?.data?.data?.approvalStatus;
      if (approvalStatus) {
        Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, approvalStatus, AUTH_COOKIE_OPTIONS);
      }

      return loginData;
    },
  });
};
