/**
 * Shared auth cookie configuration.
 *
 * Previously this object was duplicated in lib/api/auth.ts and
 * lib/hooks/useAuth.ts (with the risk of the two copies drifting apart).
 * Centralizing it here means cookie name/expiry/security flags only need
 * to change in one place.
 */
export const AUTH_COOKIE_OPTIONS = {
  expires: 7, // days
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};

export const AUTH_COOKIE_NAMES = {
  authToken: "villeto_auth_token",
  onboardingSession: "villeto_onboarding_session",
  approvalStatus: "villeto_approval_status",
} as const;

/** localStorage key for the vendor's currently-active organisation. */
export const ACTIVE_ORG_STORAGE_KEY = "villeto_active_org_id";
