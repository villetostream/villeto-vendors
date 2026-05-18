/**
 * ONBOARDING API
 * All endpoints for the 4-step onboarding flow.
 *
 * Step 1: Business Identity (identity + reg number check)
 * Step 2: Banking Details (account resolve + fuzzy match)
 * Step 3: Document Upload
 * Step 4: Review & Submit
 */

import { apiClient, uploadClient } from "./client";
import {
  BusinessIdentityForm,
  BankingDetailsForm,
  DocumentType,
  VerificationStatus,
} from "@/lib/types";

// ─────────────────────────────────────────────
// MAGIC LOOKUP (Business Identity)
// ─────────────────────────────────────────────

/**
 * Auto-fill business details from Registration Number.
 * GET /onboarding/lookup/business?reg_no=xxx
 *
 * Returns: { business_name, business_address, country }
 * Used on Step 1 to validate that the entered name matches reg records.
 */
export async function magicLookupBusiness(regNo: string): Promise<{
  business_name: string;
  business_address: string;
  country: string;
  match: boolean;
  entered_name_match_score?: number;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(
    `/onboarding/lookup/business?reg_no=${encodeURIComponent(regNo)}`
  );
  return data.data;
}

// ─────────────────────────────────────────────
// STEP 1: Save Business Identity
// ─────────────────────────────────────────────

/**
 * Save Step 1 data.
 * PATCH /vendors/onboarding/business-identity
 */
export async function saveBusinessIdentity(
  payload: BusinessIdentityForm
): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.patch(
    "/vendors/onboarding/business-identity",
    {
      businessName: payload.business_name,
      email: payload.business_email,
      registrationNumber: payload.registration_number,
      country: payload.country,
      businessAddress: payload.business_address,
    }
  );
  return data;
}

// ─────────────────────────────────────────────
// ACCOUNT RESOLVE (Banking Details)
// ─────────────────────────────────────────────

/**
 * Resolve bank account holder name.
 * POST /onboarding/banking/resolve
 *
 * Calls Paystack/Flutterwave internally.
 * Returns resolved account name.
 * Frontend then runs fuzzy match against business name.
 */
export async function resolveAccountName(payload: {
  bank_code: string;
  account_number: string;
}): Promise<{
  account_name: string;
  account_number: string;
  bank_name: string;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(
    "/onboarding/banking/resolve",
    payload
  );
  return data.data;
}

/**
 * Get list of supported banks.
 * GET /vendors/onboarding/banks?country=NG
 */
export async function getBankList(country: string = "NG"): Promise<
  { code: string; name: string; routingNumber?: string }[]
> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(
    `/vendors/onboarding/banks?country=${country}`
  );
  return data.data;
}

// ─────────────────────────────────────────────
// STEP 2: Save Banking Details
// ─────────────────────────────────────────────

/**
 * Save Step 2 data.
 * PATCH /vendors/onboarding/banking-details
 */
export async function saveBankingDetails(
  payload: BankingDetailsForm & { bank_code: string; routing_number?: string }
): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.patch("/vendors/onboarding/banking-details", {
    bankName: payload.bank_name,
    accountNumber: payload.account_number,
    routingNumber: payload.routing_number, // Optional
  });
  return data;
}

// ─────────────────────────────────────────────
// STEP 3: Document Upload
// ─────────────────────────────────────────────

/**
 * Upload a single document or change an existing one.
 * PATCH /vendors/onboarding/documents
 * Content-Type: multipart/form-data
 *
 * Returns presigned URL or stored document reference.
 */
export async function uploadDocument(
  type: DocumentType,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ document_id: string; url: string; file_name: string }> {
  const formData = new FormData();
  formData.append("documentType", type);
  formData.append("file", file);

  // INTEGRATION POINT ↓
  const { data } = await uploadClient.patch(
    "/vendors/onboarding/documents",
    formData,
    {
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }
  );
  return data.data;
}

// ─────────────────────────────────────────────
// STEP 4: Submit for Verification
// ─────────────────────────────────────────────

/**
 * Final submission — triggers automated KYC checks.
 * POST /vendors/onboarding/submit
 *
 * Backend: runs sanctions screening, re-validates bank, creates vendor record.
 * Returns: vendor status (pending_approval)
 */
export async function submitOnboarding(): Promise<{
  status: string;
  verification: VerificationStatus;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post("/vendors/onboarding/submit", {
    confirm: true,
  });
  return data.data;
}

/**
 * Get current onboarding state/review.
 * GET /vendors/onboarding/review
 */
export async function getOnboardingReview(): Promise<{
  step: number;
  businessIdentity?: unknown;
  bankingDetails?: unknown;
  documents?: unknown;
  submitted: boolean;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/vendors/onboarding/review");
  return data.data;
}
