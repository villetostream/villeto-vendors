/**
 * VENDOR NETWORK API (V2)
 * Endpoints for the V2 multi-company onboarding flow.
 */

import { apiClient, uploadClient } from "./client";
import {
  V2CompanyRelationship,
  V2OnboardingStatus,
  V2BusinessIdentityPayload,
  BankAccountOption,
  AcceptCompanyPayload,
  V2VerificationPayload,
  CompanyPaymentTermOption,
  SaveCompanyPaymentTermPayload,
  VendorPaymentTermSubmission,
  VendorPaymentTermsListResponse,
} from "@/lib/types";

// ─────────────────────────────────────────────
// COMPANY RELATIONSHIPS
// ─────────────────────────────────────────────

export async function getMyCompanies(params?: {
  page?: number;
  limit?: number;
  status?: string;
  name?: string;
  companyName?: string;
}): Promise<{ data: V2CompanyRelationship[]; total: number }> {
  try {
    const { data } = await apiClient.get("/vendor-network/me/companies", { params });
    const rawList = Array.isArray(data?.data?.data)
      ? data.data.data
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.data?.companies)
      ? data.data.companies
      : Array.isArray(data?.data?.items)
      ? data.data.items
      : [];
    return {
      data: rawList,
      total: data?.data?.total ?? rawList.length,
    };
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.status === 404) {
      try {
        const { data } = await apiClient.get("/vendors/me/companies");
        const rawList = Array.isArray(data?.data?.data)
          ? data.data.data
          : Array.isArray(data?.data)
          ? data.data
          : [];
        return {
          data: rawList,
          total: rawList.length,
        };
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

export async function getMyCompany(companyId: string): Promise<V2CompanyRelationship | null> {
  try {
    const { data } = await apiClient.get(`/vendor-network/me/companies/${companyId}`);
    return data?.data ?? null;
  } catch (err: any) {
    // A brand-new vendor who hasn't completed business-identity yet may get a
    // 404 from this endpoint. Return null instead of throwing so the onboarding
    // router can fall back to the first step gracefully.
    if (err?.response?.status === 404 || err?.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function acceptCompanyInvitation(
  companyId: string,
  payload?: AcceptCompanyPayload
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(
    `/vendor-network/me/companies/${companyId}/accept`,
    payload || {}
  );
  return data;
}

export async function rejectCompanyInvitation(companyId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(`/vendor-network/me/companies/${companyId}/reject`);
  return data;
}

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────

export async function getOnboardingStatus(companyId: string): Promise<V2OnboardingStatus> {
  const { data } = await apiClient.get(`/vendor-network/me/companies/${companyId}/onboarding`);
  return data?.data;
}

export async function saveV2BusinessIdentity(
  companyId: string,
  payload: V2BusinessIdentityPayload
): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch(
    `/vendor-network/me/companies/${companyId}/business-identity`,
    payload
  );
  return data;
}

export async function submitV2Onboarding(companyId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(`/vendor-network/me/companies/${companyId}/onboarding/submit`, {
    confirm: true,
  });
  return data;
}

// ─────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────

export async function verifyVendor(payload: V2VerificationPayload): Promise<{ success: boolean }> {
  const { data } = await apiClient.post("/vendor-network/me/verifications", payload);
  return data;
}

// ─────────────────────────────────────────────
// BANKING
// ─────────────────────────────────────────────

export async function getSavedBankAccounts(): Promise<BankAccountOption[]> {
  const { data } = await apiClient.get("/vendor-network/me/bank-accounts");
  return data?.data || [];
}

export async function saveV2BankingDetails(
  companyId: string,
  payload: {
    bankName: string;
    bankCode: string;
    accountName: string;
    accountNumber: string;
    bankOptionId?: string;
  }
): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch(
    `/vendor-network/me/companies/${companyId}/banking-details`,
    payload
  );
  return data;
}


// ─────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────

export interface UploadV2DocumentOptions {
  /** ISO date string (yyyy-MM-dd) — maps to backend field `issuedAt` */
  issuedAt?: string;
  /** ISO date string (yyyy-MM-dd) — maps to backend field `expiresAt` */
  expiresAt?: string;
  notApplicable?: boolean;
}

export async function uploadV2Document(
  companyId: string,
  type: string,
  file: File,
  onProgress?: (pct: number) => void,
  options?: UploadV2DocumentOptions
): Promise<{ document_id: string; url: string; file_name: string }> {
  const formData = new FormData();
  formData.append("documentType", type);
  formData.append("file", file);

  if (options?.issuedAt) {
    formData.append("issuedAt", options.issuedAt);
  }
  if (options?.expiresAt && !options.notApplicable) {
    formData.append("expiresAt", options.expiresAt);
  }

  const { data } = await uploadClient.patch(
    `/vendor-network/me/companies/${companyId}/documents`,
    formData,
    {
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }
  );
  return data?.data;
}

export async function viewV2Document(companyId: string, vendorDocumentId: string): Promise<{ url: string }> {
  const { data } = await apiClient.get(
    `/vendor-network/me/companies/${companyId}/documents/${vendorDocumentId}/view`
  );
  return data?.data;
}

// ─────────────────────────────────────────────
// PAYMENT TERMS
// ─────────────────────────────────────────────

export async function getCompanyPaymentTermOptions(
  companyId: string,
  legalEntity?: string
): Promise<CompanyPaymentTermOption[]> {
  const headers: Record<string, string> = {};
  if (legalEntity) {
    headers["X-Villeto-Legal-Entity"] = legalEntity;
  }
  const { data } = await apiClient.get(
    `/vendor-network/me/companies/${companyId}/payment-term-options`,
    { headers }
  );
  return Array.isArray(data?.data) ? data.data : [];
}

export async function saveCompanyPaymentTerm(
  companyId: string,
  payload: SaveCompanyPaymentTermPayload
): Promise<{ success: boolean; data?: VendorPaymentTermSubmission }> {
  const { data } = await apiClient.put(
    `/vendor-network/me/companies/${companyId}/payment-terms`,
    payload
  );
  return data;
}

export async function getVendorPaymentTerms(
  params?: {
    page?: number;
    limit?: number;
    status?: string;
    companyId?: string;
    companyName?: string;
  },
  legalEntity?: string
): Promise<VendorPaymentTermsListResponse> {
  const headers: Record<string, string> = {};
  if (legalEntity) {
    headers["X-Villeto-Legal-Entity"] = legalEntity;
  }
  const { data } = await apiClient.get("/vendor-network/me/payment-terms", {
    params,
    headers,
  });
  return {
    data: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { totalCount: 0, totalPages: 0, currentPage: 1, limit: 10 },
  };
}

export async function getVendorPaymentTermById(
  paymentTermId: string
): Promise<VendorPaymentTermSubmission> {
  const { data } = await apiClient.get(`/vendor-network/me/payment-terms/${paymentTermId}`);
  return data?.data ?? data;
}

