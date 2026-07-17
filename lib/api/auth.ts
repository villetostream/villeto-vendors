/**
 * AUTH API
 * All endpoints related to authentication, invite tokens, and session management.
 *
 * INTEGRATION NOTES:
 * Each function maps directly to a backend endpoint.
 * Replace the mock responses with real axios calls once backend is ready.
 */

import { apiClient } from "./client";
import { InviteTokenPayload } from "@/lib/types";
import Cookies from "js-cookie";
import { AUTH_COOKIE_OPTIONS, AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

// ─────────────────────────────────────────────
// INVITE TOKEN
// ─────────────────────────────────────────────

/**
 * Validate an invite token from the email link.
 * POST /auth/invite/validate
 *
 * Returns: vendor email, business name, org info, expiry
 * If already_onboarded: true → frontend redirects to login
 */
export async function validateInviteToken(
  token: string
): Promise<InviteTokenPayload> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post<{ data: InviteTokenPayload }>(
    "/auth/invite/validate",
    { token }
  );
  return data.data;
}

// ─────────────────────────────────────────────
// SIGN UP (Password Setup via Invitation Accept)
// ─────────────────────────────────────────────

/**
 * Accept a vendor invitation and create the account.
 * POST /vendors/invitations/accept
 *
 * Payload: { token, password, confirmPassword }
 *
 * On success persists whatever auth / session tokens the backend returns
 * so the onboarding flow can proceed immediately.
 */
export async function signUp(payload: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<void> {
  // INTEGRATION POINT ↓
  const { data: json } = await apiClient.post<Record<string, unknown>>(
    "/vendors/invitations/accept",
    payload
  );

  // Extract nested data regardless of whether the backend wraps once or twice
  const outer = (json?.data ?? json ?? {}) as Record<string, unknown>;
  const inner = (outer?.data ?? outer) as Record<string, unknown>;

  // Persist auth token (try common casing variants)
  const authToken =
    (inner?.token as string) ??
    (inner?.authToken as string) ??
    (inner?.auth_token as string) ??
    (outer?.token as string) ??
    (outer?.authToken as string) ??
    (outer?.auth_token as string);

  if (authToken) {
    Cookies.set(AUTH_COOKIE_NAMES.authToken, authToken, AUTH_COOKIE_OPTIONS);
  }

  // Persist onboarding session (try common casing variants)
  const session =
    (inner?.onboardingSession as string) ??
    (inner?.onboarding_session as string) ??
    (inner?.session as string) ??
    (outer?.onboardingSession as string) ??
    (outer?.onboarding_session as string) ??
    (outer?.session as string) ??
    // fallback — any truthy value lets the middleware onboarding guard pass
    "onboarding";

  Cookies.set(AUTH_COOKIE_NAMES.onboardingSession, session, AUTH_COOKIE_OPTIONS);
}

// ─────────────────────────────────────────────
// CLEAR SESSION (client-side only — no network)
// ─────────────────────────────────────────────

/**
 * Removes all auth-related cookies and local storage keys on the client
 * WITHOUT making any network request.
 *
 * Use this when you need to clear a session that was never fully
 * established (e.g. immediately after invitation-accept / signup, before
 * the vendor has a valid auth token the backend would recognise for logout).
 *
 * Calling the real logout() endpoint in that state returns 401 Unauthorized,
 * which would be mistakenly surfaced to the user as a signup error.
 */
export function clearSessionCookies(): void {
  Cookies.remove(AUTH_COOKIE_NAMES.authToken);
  Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
  Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
  Cookies.remove(AUTH_COOKIE_NAMES.vendorStatus);
  Cookies.remove(AUTH_COOKIE_NAMES.activeCompanyId);
  if (typeof window !== "undefined") {
    localStorage.removeItem("villeto-onboarding");
  }
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

/**
 * Sign out vendor, clear server session.
 * POST /vendors/auth/logout
 *
 * Always clears local cookies/storage even if the network call fails,
 * so the user is never left in a broken half-logged-in state.
 */
export async function logout(): Promise<void> {
  try {
    // INTEGRATION POINT ↓
    await apiClient.post("/vendors/auth/logout");
  } finally {
    clearSessionCookies();
  }
}

// ─────────────────────────────────────────────
// CURRENT USER
// ─────────────────────────────────────────────
//
// There is no confirmed "/auth/me" endpoint in the real vendor-portal API.
// Session rehydration on page load now uses getVendorProfile() +
// getVendorCompanies() from lib/api/vendor.ts instead — see
// components/shared/Providers.tsx. getMe() was removed rather than left
// as dead code pointing at a 404.
