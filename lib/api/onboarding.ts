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
 * POST /onboarding/business-identity
 */
export async function saveBusinessIdentity(
  payload: BusinessIdentityForm
): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(
    "/onboarding/business-identity",
    payload
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
 * GET /onboarding/banking/banks?country=NG
 */
export async function getBankList(country: string = "NG"): Promise<
  { code: string; name: string }[]
> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(
    `/onboarding/banking/banks?country=${country}`
  );
  return data.data;
}

// ─────────────────────────────────────────────
// STEP 2: Save Banking Details
// ─────────────────────────────────────────────

/**
 * Save Step 2 data.
 * POST /onboarding/banking
 */
export async function saveBankingDetails(
  payload: BankingDetailsForm & { bank_code: string }
): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post("/onboarding/banking", payload);
  return data;
}

// ─────────────────────────────────────────────
// STEP 3: Document Upload
// ─────────────────────────────────────────────

/**
 * Upload a single document.
 * POST /onboarding/documents/upload
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
  formData.append("type", type);
  formData.append("file", file);

  // INTEGRATION POINT ↓
  const { data } = await uploadClient.post(
    "/onboarding/documents/upload",
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
 * POST /onboarding/submit
 *
 * Backend: runs sanctions screening, re-validates bank, creates vendor record.
 * Returns: vendor status (pending_approval)
 */
export async function submitOnboarding(): Promise<{
  status: string;
  verification: VerificationStatus;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post("/onboarding/submit");
  return data.data;
}

/**
 * Get current onboarding state (for resume / reload).
 * GET /onboarding/state
 */
export async function getOnboardingState(): Promise<{
  step: number;
  business_identity?: BusinessIdentityForm;
  banking?: BankingDetailsForm;
  documents?: { type: DocumentType; uploaded: boolean; file_name?: string }[];
  submitted: boolean;
}> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/onboarding/state");
  return data.data;
}
