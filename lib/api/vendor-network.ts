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

export async function getMyCompany(companyId: string): Promise<V2CompanyRelationship> {
  const { data } = await apiClient.get(`/vendor-network/me/companies/${companyId}`);
  return data?.data;
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

export async function uploadV2Document(
  companyId: string,
  type: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ document_id: string; url: string; file_name: string }> {
  const formData = new FormData();
  formData.append("documentType", type);
  formData.append("file", file);

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
