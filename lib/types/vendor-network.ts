/**
 * VENDOR NETWORK TYPES (V2)
 */

export interface V2CompanyRelationship {
  vendorId: string;
  companyId: string;
  companyName: string;
  status: "Active" | "Inactive" | "archive" | "rejected" | "pending_approval" | string;
  nextAction?: "accept_invitation" | "complete_onboarding" | "submitted" | "available" | "rejected" | string | null;
  availableActions?: string[];
  verificationRequested: boolean;
  verificationAvailable?: boolean;
  onboardingStatus?: string;
  currentStep?: string;
  approvalStatus?: string | null;
  decisionNote?: string | null;
  rejectionReason?: string | null;
  isPaymentEnabled?: boolean;
  usesCompanyBankingDetails?: boolean;
  onboardingMethod?: string;
  verification?: unknown | null;
  businessDetails?: {
    legalName?: string | null;
    displayName?: string | null;
    email?: string | null;
    country?: string | null;
    businessAddress?: string | null;
    registrationNumber?: string | null;
    tin?: string | null;
    verificationMethod?: string | null;
  };
  bankingDetails?: {
    source?: string | null;
    bankName?: string | null;
    bankCode?: string | null;
    accountName?: string | null;
    maskedAccountNumber?: string | null;
    isComplete?: boolean;
  };
  documents?: {
    vendorDocumentId: string;
    documentType: string;
    originalName: string;
    mimeType?: string;
    fileSize?: number;
    fileUrl?: string;
    uploadedAt?: string;
    verificationStatus?: string;
    scope?: string;
    viewEndpoint?: string;
  }[];
}

export interface V2BusinessIdentity {
  businessName?: string;
  email?: string;
  registrationNumber?: string;
  country?: string;
  businessAddress?: string;
  verificationMethod?: "cac" | "tin" | string;
}

export interface V2OnboardingStatus {
  canSubmit: boolean;
  missingItems: string[];
  documentsRequired: boolean;
  verificationRequested: boolean;
  verificationAvailable: boolean;
  supportedVerificationMethods: string[];
  verificationMessage?: string;
  nextAction?: string;
  accessState?: string;
  businessIdentity: V2BusinessIdentity;
}

export interface BankAccountOption {
  bankOptionId: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  maskedAccountNumber: string;
}

export interface V2VerificationPayload {
  method: "cac" | "tin" | string;
  identifier: string;
  expectedLegalName: string;
  companyId: string;
}

export interface AcceptCompanyPayload {
  bankOptionId?: string;
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
  accountName?: string;
}

export interface V2BusinessIdentityPayload {
  businessName?: string;
  email?: string;
  registrationNumber?: string;
  country?: string;
  businessAddress?: string;
  verificationMethod?: "cac" | "tin" | string;
}

export interface CompanyPaymentTermOption {
  vendorPaymentTermOptionId: string;
  code: string;
  name: string;
  description?: string;
  days: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SaveCompanyPaymentTermPayload {
  /** Selecting a company preset — send ONLY this field */
  optionId?: string;
  /** Reusing a prior term — send ONLY this field */
  reusePaymentTermId?: string;
  /** Custom terms — send ONLY name + days (no optionId) */
  name?: string;
  days?: number;
}

export type PaymentTermStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "superseded"
  | string;

export interface VendorPaymentTermSubmission {
  paymentTermId: string;
  companyId: string;
  companyName: string;
  vendorId: string;
  vendorName: string;
  code?: string;
  name: string;
  days: number;
  status: PaymentTermStatus;
  revision: number;
  isCurrent: boolean;
  rejectionReason?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPaymentTermsListResponse {
  data: VendorPaymentTermSubmission[];
  meta: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

