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
import { AUTH_COOKIE_NAMES, ACTIVE_ORG_STORAGE_KEY } from "@/lib/constants/auth";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.villeto.com";

/**
 * Endpoints a vendor can hit *without* an existing session. A 401 from one
 * of these almost always means "wrong credentials" or "invalid/expired
 * token", not "your session expired" — so it must NOT trigger the global
 * clear-cookies-and-hard-redirect behavior below. Without this, simply
 * typing the wrong password on the login page would wipe the inline error
 * toast via an immediate full-page redirect before the vendor ever saw it.
 */
const PUBLIC_AUTH_PATHS = [
  "/vendors/auth/login",
  "/auth/invite/validate",
  "/vendors/invitations/accept",
  "/vendors/invitations/preview",
];

function isPublicAuthRequest(url?: string): boolean {
  if (!url) return false;
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

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
    const token = Cookies.get(AUTH_COOKIE_NAMES.authToken);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2. Inject active org_id from localStorage
    //    (set by org switcher in orgStore)
    if (typeof window !== "undefined") {
      const orgId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
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

    // Token expired or invalid → clear session and redirect.
    // Skip this for public/unauthenticated endpoints (see comment above).
    if (status === 401 && !isPublicAuthRequest(error.config?.url)) {
      Cookies.remove(AUTH_COOKIE_NAMES.authToken);
      Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
      Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
      if (typeof window !== "undefined") {
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
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
  const token = Cookies.get(AUTH_COOKIE_NAMES.authToken);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const orgId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
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

    if (status === 401 && !isPublicAuthRequest(error.config?.url)) {
      Cookies.remove(AUTH_COOKIE_NAMES.authToken);
      Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
      Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
      if (typeof window !== "undefined") {
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
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
