/**
 * API CLIENT
 * Central axios instance for all API calls.
 *
 * Features:
 * - Automatic auth token injection from cookie/memory
 * - Automatic org_id injection (from active org context)
 * - Request/response interceptors
 * - 401 handling → redirect to login
 * - Error normalization
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.villeto.com";

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ── Request interceptor ───────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 1. Inject auth token
    const token = Cookies.get("villeto_auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2. Inject active org_id from localStorage
    //    (set by org switcher in orgStore)
    if (typeof window !== "undefined") {
      const orgId = localStorage.getItem("villeto_active_org_id");
      if (orgId && config.headers) {
        config.headers["X-Org-Id"] = orgId;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ─────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;

    // Token expired or invalid → clear session and redirect
    if (status === 401) {
      Cookies.remove("villeto_auth_token");
      Cookies.remove("villeto_onboarding_session");
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    }

    // Normalize error for consumers
    const apiError = {
      message:
        (error.response?.data as { message?: string })?.message ??
        error.message ??
        "An unexpected error occurred",
      status,
      code: (error.response?.data as { code?: string })?.code,
    };

    return Promise.reject(apiError);
  }
);

// ─────────────────────────────────────────────
// MULTIPART CLIENT (file uploads)
// ─────────────────────────────────────────────

export const uploadClient = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000, // 2 min for large file uploads
});

uploadClient.interceptors.request.use((config) => {
  const token = Cookies.get("villeto_auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const orgId = localStorage.getItem("villeto_active_org_id");
    if (orgId) config.headers["X-Org-Id"] = orgId;
  }
  // Let browser set Content-Type with boundary for multipart
  delete config.headers["Content-Type"];
  return config;
});

uploadClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      Cookies.remove("villeto_auth_token");
      Cookies.remove("villeto_onboarding_session");
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    }

    const apiError = {
      message:
        (error.response?.data as { message?: string })?.message ??
        error.message ??
        "Upload failed",
      status,
      code: (error.response?.data as { code?: string })?.code,
    };

    return Promise.reject(apiError);
  }
);
