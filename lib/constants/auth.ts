/**
 * Shared auth cookie configuration.
 *
 * Centralized here so cookie name/expiry/security flags only change in one
 * place. `authToken` is re-issued on every switch-company call — see
 * lib/hooks/useCompany.ts — so its lifetime should track the JWT's own
 * expiry rather than a long-lived 7 days once the backend confirms token
 * TTL (currently unconfirmed; using 7 days as a safe upper bound that gets
 * overwritten well before then in practice).
 */
export const AUTH_COOKIE_OPTIONS = {
  expires: 7, // days
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};

export const AUTH_COOKIE_NAMES = {
  authToken: "villeto_auth_token",
  onboardingSession: "villeto_onboarding_session",
  /** Raw `approvalStatus` from the backend — drives the rejected branch only. */
  approvalStatus: "villeto_approval_status",
  /**
   * Raw `status` from the backend for the *currently selected* company.
   * This — not approvalStatus — is what gates dashboard/orders/invoices
   * access, per the "approved != has access, active does" decision.
   * Read it with `isStatusActive()` from lib/utils since backend casing
   * is inconsistent ("Inactive" vs "active").
   */
  vendorStatus: "villeto_vendor_status",
  /** companyId of the currently-selected tenant relationship. */
  activeCompanyId: "villeto_active_company_id",
} as const;

/**
 * BroadcastChannel name used to keep multiple tabs in sync on
 * company-switch and logout, so a stale tab can never keep acting on a
 * company context that's no longer selected elsewhere.
 */
export const AUTH_BROADCAST_CHANNEL = "villeto_auth_sync";
