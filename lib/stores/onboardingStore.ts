/**
 * ONBOARDING STORE
 * Manages state across all 4 onboarding steps.
 * Persisted to sessionStorage so progress survives page reload.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  BusinessIdentityForm,
  BankingDetailsForm,
  DocumentType,
} from "@/lib/types";

export type OnboardingStep =
  | "business-identity"
  | "banking"
  | "documents"
  | "review";

interface DocumentState {
  type: DocumentType;
  label: string;
  required: boolean;
  file_name?: string;
  document_id?: string;
  url?: string;
  uploaded: boolean;
}

interface OnboardingState {
  currentStep: OnboardingStep;
  inviteToken: string | null;
  vendorEmail: string | null;
  businessName: string | null;

  // Step data
  businessIdentity: Partial<BusinessIdentityForm>;
  banking: Partial<BankingDetailsForm & { bank_code: string }>;
  documents: DocumentState[];

  // Verification results
  bankResolvedName: string | null;
  bankMatchScore: number | null;
  bankFlagged: boolean;

  // Actions
  setInviteContext: (token: string, email: string, businessName: string) => void;
  setStep: (step: OnboardingStep) => void;
  saveBusinessIdentity: (data: BusinessIdentityForm) => void;
  saveBanking: (
    data: BankingDetailsForm & { bank_code: string },
    resolvedName: string,
    matchScore: number
  ) => void;
  updateDocument: (type: DocumentType, update: Partial<DocumentState>) => void;
  reset: () => void;
}

const DEFAULT_DOCUMENTS: DocumentState[] = [
  {
    type: "certificate_of_incorporation",
    label: "Certificate of Incorporation",
    required: true,
    uploaded: false,
  },
  {
    type: "tax_certificate",
    label: "Tax Certificate",
    required: true,
    uploaded: false,
  },
  {
    type: "government_id",
    label: "Government ID",
    required: true,
    uploaded: false,
  },
  {
    type: "bank_doc",
    label: "Bank Doc (Optional)",
    required: false,
    uploaded: false,
  },
];

const STEPS: OnboardingStep[] = [
  "business-identity",
  "banking",
  "documents",
  "review",
];

export function getStepIndex(step: OnboardingStep) {
  return STEPS.indexOf(step);
}

export function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const idx = STEPS.indexOf(current);
  return idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
}

export function getPrevStep(current: OnboardingStep): OnboardingStep | null {
  const idx = STEPS.indexOf(current);
  return idx > 0 ? STEPS[idx - 1] : null;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      currentStep: "business-identity",
      inviteToken: null,
      vendorEmail: null,
      businessName: null,
      businessIdentity: {},
      banking: {},
      documents: DEFAULT_DOCUMENTS,
      bankResolvedName: null,
      bankMatchScore: null,
      bankFlagged: false,

      setInviteContext: (token, email, businessName) =>
        set({ inviteToken: token, vendorEmail: email, businessName }),

      setStep: (step) => set({ currentStep: step }),

      saveBusinessIdentity: (data) =>
        set({ businessIdentity: data, currentStep: "banking" }),

      saveBanking: (data, resolvedName, matchScore) =>
        set({
          banking: data,
          bankResolvedName: resolvedName,
          bankMatchScore: matchScore,
          bankFlagged: matchScore < 90,
          currentStep: "documents",
        }),

      updateDocument: (type, update) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.type === type ? { ...d, ...update } : d
          ),
        })),

      reset: () =>
        set({
          currentStep: "business-identity",
          inviteToken: null,
          vendorEmail: null,
          businessName: null,
          businessIdentity: {},
          banking: {},
          documents: DEFAULT_DOCUMENTS,
          bankResolvedName: null,
          bankMatchScore: null,
          bankFlagged: false,
        }),
    }),
    {
      name: "villeto-onboarding",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : localStorage
      ),
      // Don't persist the token or email to storage for security
      partialize: (state) => ({
        currentStep: state.currentStep,
        businessIdentity: state.businessIdentity,
        banking: state.banking,
        documents: state.documents,
        bankResolvedName: state.bankResolvedName,
        bankMatchScore: state.bankMatchScore,
        bankFlagged: state.bankFlagged,
      }),
    }
  )
);
