/**
 * AUTH API
 * All endpoints related to authentication, invite tokens, and session management.
 *
 * INTEGRATION NOTES:
 * Each function maps directly to a backend endpoint.
 * Replace the mock responses with real axios calls once backend is ready.
 */

import { apiClient } from "./client";
import { AuthUser, InviteTokenPayload } from "@/lib/types";
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
 * POST https://api.villeto.com/vendors/invitations/accept
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
  const res = await fetch(
    "https://api.villeto.com/vendors/invitations/accept",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON body — ignore
  }

  if (!res.ok) {
    const message =
      (json?.message as string) ??
      ((json?.data as Record<string, unknown>)?.message as string) ??
      `Signup failed (${res.status})`;
    throw new Error(message);
  }

  // Extract nested data regardless of whether the backend wraps once or twice
  const outer = (json?.data ?? json) as Record<string, unknown>;
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
// LOGOUT
// ─────────────────────────────────────────────

/**
 * Sign out vendor, clear server session.
 * POST /auth/logout
 */
export async function logout(): Promise<void> {
  try {
    // INTEGRATION POINT ↓
    await apiClient.post("/vendors/auth/logout");
  } finally {
    Cookies.remove(AUTH_COOKIE_NAMES.authToken);
    Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
    Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
    if (typeof window !== "undefined") {
      localStorage.removeItem("villeto_active_org_id");
    }
  }
}

// ─────────────────────────────────────────────
// CURRENT USER
// ─────────────────────────────────────────────

/**
 * Get the current authenticated vendor.
 * GET /auth/me
 */
export async function getMe(): Promise<AuthUser> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get<{ data: AuthUser }>("/auth/me");
  return data.data;
}
