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

// Cookie config
const COOKIE_OPTIONS = {
  expires: 7, // 7 days
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};

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
// SIGN UP (Password Setup)
// ─────────────────────────────────────────────

/**
 * Create vendor account with password.
 * POST /auth/signup
 *
 * Called after vendor sees invite landing and proceeds to set password.
 * Returns auth token + onboarding session.
 */
export async function signUp(payload: {
  token: string;
  password: string;
  confirm_password: string;
}): Promise<{ auth_token: string; onboarding_session: string; user: AuthUser }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post<{
    data: {
      auth_token: string;
      onboarding_session: string;
      user: AuthUser;
    };
  }>("/auth/signup", payload);

  // Persist tokens
  Cookies.set("villeto_auth_token", data.data.auth_token, COOKIE_OPTIONS);
  Cookies.set(
    "villeto_onboarding_session",
    data.data.onboarding_session,
    COOKIE_OPTIONS
  );

  return data.data;
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

/**
 * Vendor sign in.
 * POST /auth/login
 */
export async function login(payload: {
  email: string;
  password: string;
}): Promise<{ auth_token: string; user: AuthUser }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post<{
    data: { auth_token: string; user: AuthUser };
  }>("/auth/login", payload);

  Cookies.set("villeto_auth_token", data.data.auth_token, COOKIE_OPTIONS);

  return data.data;
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
    await apiClient.post("/auth/logout");
  } finally {
    Cookies.remove("villeto_auth_token");
    Cookies.remove("villeto_onboarding_session");
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
