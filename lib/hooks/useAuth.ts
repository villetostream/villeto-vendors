"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import Cookies from "js-cookie";

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
      status: string;
      isPaymentEnabled: boolean;
      currentStep: string;
      businessIdentity: Record<string, unknown>;
      bankingDetails: Record<string, unknown>;
      documents: Record<string, unknown>;
    };
  };
}

const COOKIE_OPTIONS = {
  expires: 7, // 7 days
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};

export const useLogin = (): UseMutationResult<LoginResponse, Error, LoginPayload> => {
  return useMutation<LoginResponse, Error, LoginPayload>({
    mutationFn: async (payload: LoginPayload) => {
      const res = await apiClient.post<LoginResponse>("/vendors/auth/login", payload);
      const loginData = res.data;

      // Ensure we extract the token exactly as structured in the backend response
      const token = loginData?.data?.accessToken;
      if (token) {
        Cookies.set("villeto_auth_token", token, COOKIE_OPTIONS);
      }

      return loginData;
    },
  });
};
