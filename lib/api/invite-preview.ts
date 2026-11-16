import { getApiBaseUrl } from "@/lib/security/urls";

/**
 * Shape returned by POST /vendors/invitations/preview
 */
export interface InvitePreviewData {
  vendorId: string;
  vendorInvitationId: string;
  email: string;
  displayName: string;
  legalName: string;
  onboardingStatus: string;
  expiresAt: string;
  isExpired: boolean;
  isConsumed: boolean;
  inviteeType: "new_vendor" | "existing_vendor";
  nextAction: "set_password" | "verify_existing_password" | "login_to_accept";
  companyId: string;
  companyName: string;
  accountExists: boolean;
  requiresPasswordSetup: boolean;
  requiresExistingPassword: boolean;
  hasReusableProfile: boolean;
  hasActiveVendorRelationship: boolean;
}

export type InvitePreviewResult =
  | { ok: true; data: InvitePreviewData }
  | { ok: false; reason: "invalid"; consumed?: boolean }
  | { ok: false; reason: "transient" };

/**
 * Validates an invitation token server-side with a bounded timeout.
 */
export async function validateInviteTokenPreview(
  token: string
): Promise<InvitePreviewResult> {
  const apiBaseUrl = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/vendors/invitations/preview`, {
      method: "POST",
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "transient" };
  }

  if (!res.ok) {
    const isDefinitelyInvalid = [400, 404, 410, 422].includes(res.status);
    return { ok: false, reason: isDefinitelyInvalid ? "invalid" : "transient" };
  }

  let json: { data?: { data?: InvitePreviewData } };
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: "transient" };
  }

  const data = json?.data?.data;
  if (!data) return { ok: false, reason: "transient" };

  if (data.isConsumed) return { ok: false, reason: "invalid", consumed: true };
  if (data.isExpired) return { ok: false, reason: "invalid", consumed: false };

  return { ok: true, data };
}
