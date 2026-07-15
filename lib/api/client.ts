/**
 * API CLIENT
 * Central axios instance for all API calls.
 *
 * Company/tenant scoping now comes from the JWT itself (companyId claim,
 * set server-side on login/switch-company) — NOT an X-Org-Id header. This
 * replaced the earlier header-based design specifically because it lets
 * two tabs silently diverge (tab A switches company, tab B keeps sending
 * the old header and gets tab-A's-old data mixed with tab-B's-new token).
 * A superseded JWT is the enforcement point instead: see
 * lib/hooks/useCompany.ts for the switch flow and the cross-tab broadcast
 * that keeps other tabs from acting on a stale context.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { broadcastAuthEvent } from "@/lib/utils/authBroadcast";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.villeto.com";

/**
 * Endpoints a vendor can hit *without* an existing session. A 401 from one
 * of these almost always means "wrong credentials" or "invalid/expired
 * token", not "your session expired" — so it must NOT trigger the global
 * clear-cookies-and-hard-redirect behavior below.
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

function clearSessionCookies() {
  Cookies.remove(AUTH_COOKIE_NAMES.authToken);
  Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
  Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
  Cookies.remove(AUTH_COOKIE_NAMES.vendorStatus);
  Cookies.remove(AUTH_COOKIE_NAMES.activeCompanyId);
}

function handleSessionExpired() {
  clearSessionCookies();
  if (typeof window !== "undefined") {
    // Don't force-redirect if the user is on a public page that doesn't
    // require a session — /invite and /signup are entry points for new
    // vendors who have no auth token yet.
    const publicPaths = ["/invite", "/signup", "/auth/login"];
    const isPublicPage = publicPaths.some((p) =>
      window.location.pathname.startsWith(p)
    );
    if (isPublicPage) return;

    // Tell any other open tabs their session/token is gone too — a
    // superseded or expired token in tab A should not let tab B keep
    // acting on a company context that's no longer valid anywhere.
    broadcastAuthEvent({ type: "logout" });
    window.location.href = "/auth/login";
  }
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get(AUTH_COOKIE_NAMES.authToken);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401 && !isPublicAuthRequest(error.config?.url)) {
      handleSessionExpired();
    }

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
  timeout: 120_000,
});

uploadClient.interceptors.request.use((config) => {
  const token = Cookies.get(AUTH_COOKIE_NAMES.authToken);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  delete config.headers["Content-Type"];
  return config;
});

uploadClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401 && !isPublicAuthRequest(error.config?.url)) {
      handleSessionExpired();
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
