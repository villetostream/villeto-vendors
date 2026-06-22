/**
 * VENDOR API
 * Profile, organizations, dashboard stats.
 */

import { apiClient } from "./client";
import { AuthUser, ApprovalStatus, OnboardingStatus, DashboardStats, Organization } from "@/lib/types";

/**
 * Get vendor profile.
 * GET /vendor/profile
 */
export async function getVendorProfile(): Promise<AuthUser & {
  registration_number: string;
  country: string;
  business_address: string;
  bank_name: string;
  account_number: string;
  documents: { type: string; label: string; file_name: string; url: string }[];
  profile_completion: number;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/vendor/profile");
  return data.data;
}

/**
 * Update vendor profile section.
 * PATCH /vendor/profile
 */
export async function updateVendorProfile(
  section: "business_identity" | "banking",
  payload: Record<string, unknown>
): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.patch(`/vendor/profile/${section}`, payload);
  return data;
}

/**
 * Get all organizations this vendor is connected to.
 * GET /vendor/organizations
 */
export async function getVendorOrganizations(): Promise<Organization[]> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/vendor/organizations");
  return data.data;
}

/**
 * Get dashboard stats scoped to active org.
 * GET /dashboard/stats
 * Automatically scoped by X-Org-Id header.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/dashboard/stats");
  return data.data;
}

/**
 * Get the current authenticated vendor's profile and approval status.
 * GET /vendors/me
 *
 * This is the canonical endpoint for polling approval status on the
 * /pending page. Returns vendor identity, onboarding status, approvalStatus,
 * and decisionNote.
 */
export async function getVendorMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<{
    message: string;
    status: number;
    data: {
      vendorId: string;
      email: string;
      displayName: string;
      legalName: string;
      status: string;
      onboardingStatus: string;
      approvalStatus: string;
      decisionNote: string | null;
      isPaymentEnabled: boolean;
    };
  }>("/vendors/me");

  const v = data.data;

  // Map backend field names → internal AuthUser shape
  return {
    id: v.vendorId,
    email: v.email,
    business_name: v.displayName ?? v.legalName,
    status: "active" as AuthUser["status"], // status field not needed for this poll
    approvalStatus: v.approvalStatus as ApprovalStatus,
    onboardingStatus: v.onboardingStatus as OnboardingStatus,
    decisionNote: v.decisionNote ?? null,
  };
}

/**
 * Send a message to the reviewing company (pending approval phase).
 * POST /vendor/messages
 */
export async function sendMessage(message: string): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post("/vendor/messages", { message });
  return data;
}
