/**
 * VENDOR API
 * Company relationships, switching, procurement summary, profile.
 */

import { apiClient } from "./client";
import {
  ApiEnvelope,
  CompanyRelationship,
  CurrentVendor,
  DashboardSummary,
  SummaryFilters,
  UpdateVendorProfilePayload,
  VendorProfile,
} from "@/lib/types";

// ─────────────────────────────────────────────
// MULTI-COMPANY
// ─────────────────────────────────────────────

/**
 * List every tenant company relationship for the logged-in vendor account.
 * GET /vendors/me/companies
 */
export async function getVendorCompanies(): Promise<CompanyRelationship[]> {
  const { data } = await apiClient.get<ApiEnvelope<{ data: CompanyRelationship[] }>>(
    "/vendors/me/companies"
  );
  return data.data.data;
}

export interface SwitchCompanyResult {
  accessToken: string;
  onboardingMode: string;
  currentVendor: CurrentVendor;
  companies: CompanyRelationship[];
}

/**
 * Switch the active company context. Returns a fresh JWT scoped to the
 * selected company-specific vendor row — the old token should be treated
 * as no longer valid for this session from this point on (server-side
 * invalidation to be confirmed with backend).
 * POST /vendors/me/switch-company
 */
export async function switchCompany(vendorId: string): Promise<SwitchCompanyResult> {
  const { data } = await apiClient.post<ApiEnvelope<SwitchCompanyResult>>(
    "/vendors/me/switch-company",
    { vendorId }
  );
  return data.data;
}

// ─────────────────────────────────────────────
// PROCUREMENT SUMMARY
// ─────────────────────────────────────────────

/**
 * Dashboard summary scoped to the currently selected company (from the
 * active JWT — no header needed).
 * GET /vendor-portal/summary
 */
export async function getVendorSummary(filters: SummaryFilters = {}): Promise<DashboardSummary> {
  const { data } = await apiClient.get<ApiEnvelope<DashboardSummary>>(
    "/vendor-portal/summary",
    { params: filters }
  );
  return data.data;
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

/**
 * Vendor profile for the currently selected company context.
 * GET /vendor-portal/profile
 *
 * Note: this endpoint currently returns identity fields (legalName,
 * displayName, address, etc.) mixed with tenant-scoped fields (status,
 * approvalStatus, isPaymentEnabled) in one flat object. The Tier 1/Tier 2
 * field-lock proposal (see PROFILE_FIELD_TIERS below) assumes these will
 * eventually be split at the API level; until then the frontend enforces
 * the split purely client-side by disabling inputs for locked fields.
 */
export async function getVendorProfile(): Promise<VendorProfile> {
  const { data } = await apiClient.get<ApiEnvelope<VendorProfile>>(
    "/vendor-portal/profile"
  );
  return data.data;
}

/**
 * Update the tenant-editable profile fields only.
 * PATCH /vendor-portal/profile
 *
 * Deliberately typed to only accept Tier 2 fields (displayName, phone,
 * description, contactFirstName, contactLastName, address, country) per
 * UpdateVendorProfilePayload — legalName/registrationNumber/documents are
 * not accepted here even if a future backend change allows them in the
 * body, because the UI must never offer to edit them from this form. Use
 * a distinct "request correction" flow for those (not yet built — pending
 * the endpoint backend needs to add).
 */
export async function updateVendorProfile(
  payload: UpdateVendorProfilePayload
): Promise<VendorProfile> {
  const { data } = await apiClient.patch<ApiEnvelope<VendorProfile>>(
    "/vendor-portal/profile",
    payload
  );
  return data.data;
}

// ─────────────────────────────────────────────
// PENDING-APPROVAL MESSAGING
// No confirmed backend endpoint yet for this — kept as a stub matching the
// UI in app/(onboarding)/pending/page.tsx. Do not wire this to a live
// endpoint until backend confirms one exists; calling it today will 404.
// ─────────────────────────────────────────────

export async function sendMessage(message: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post("/vendor-portal/messages", { message });
  return data;
}
