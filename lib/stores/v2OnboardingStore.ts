/**
 * V2 ONBOARDING STORE
 * State for the per-company V2 onboarding flow.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  V2OnboardingStatus,
  V2BusinessIdentity,
  BankAccountOption,
} from "@/lib/types";

interface V2OnboardingState {
  activeCompanyId: string | null;
  onboardingStatus: V2OnboardingStatus | null;
  
  // Local form state so data survives step navigation
  businessIdentity: V2BusinessIdentity;
  bankingMode: "new" | "reuse" | null;
  selectedBankOptionId: string | null;
  savedBankAccounts: BankAccountOption[];
  bankingDetails: { bankName: string; accountNumber: string; accountName: string; bankCode?: string; } | null;
  uploadedDocuments: { id: string; name: string; url?: string }[];

  /**
   * Fingerprint of the last payload successfully saved per step for the
   * active company. If the user goes back and continues without changing
   * anything, the step can skip the network call entirely.
   */
  savedFingerprints: Partial<Record<V2Step, string>>;
  // Actions
  setActiveCompanyId: (companyId: string) => void;
  setOnboardingStatus: (status: V2OnboardingStatus) => void;
  saveBusinessIdentityLocally: (data: V2BusinessIdentity) => void;
  setBankingMode: (mode: "new" | "reuse") => void;
  setSelectedBankOptionId: (id: string) => void;
  setSavedBankAccounts: (accounts: BankAccountOption[]) => void;
  saveBankingDetailsLocally: (details: { bankName: string; accountNumber: string; accountName: string; bankCode?: string; }) => void;
  setUploadedDocumentsLocally: (docs: { id: string; name: string; url?: string }[]) => void;
  markStepSaved: (step: V2Step, fingerprint: string) => void;
  reset: () => void;
}

export type V2Step = "businessIdentity" | "banking" | "documents";

/** Stable, order-independent fingerprint of a flat payload (trims strings). */
export function fingerprint(data: Record<string, unknown>): string {
  const normalized = Object.keys(data)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      const v = data[k];
      if (v === undefined || v === null || v === "") return acc;
      acc[k] = typeof v === "string" ? v.trim() : v;
      return acc;
    }, {});
  return JSON.stringify(normalized);
}

export const useV2OnboardingStore = create<V2OnboardingState>()(
  persist(
    (set) => ({
      activeCompanyId: null,
      onboardingStatus: null,
      businessIdentity: {},
      bankingMode: null,
      selectedBankOptionId: null,
      savedBankAccounts: [],

      bankingDetails: null,
      uploadedDocuments: [],
      savedFingerprints: {},

      setActiveCompanyId: (companyId) => 
        set((state) => {
          if (state.activeCompanyId === companyId) return state;
          // Clear form state when switching companies
          return {
            activeCompanyId: companyId,
            onboardingStatus: null,
            businessIdentity: {},
            bankingMode: null,
            selectedBankOptionId: null,
            savedBankAccounts: [],
            bankingDetails: null,
            uploadedDocuments: [],
            savedFingerprints: {},
          };
        }),

      setOnboardingStatus: (status) => set({ onboardingStatus: status }),
      saveBusinessIdentityLocally: (data) => set({ businessIdentity: data }),
      setBankingMode: (mode) => set({ bankingMode: mode }),
      setSelectedBankOptionId: (id) => set({ selectedBankOptionId: id }),
      setSavedBankAccounts: (accounts) => set({ savedBankAccounts: accounts }),
      saveBankingDetailsLocally: (details) => set({ bankingDetails: details }),
      setUploadedDocumentsLocally: (docs) => set({ uploadedDocuments: docs }),
      markStepSaved: (step, fp) =>
        set((state) => ({ savedFingerprints: { ...state.savedFingerprints, [step]: fp } })),
      
      reset: () =>
        set({
          activeCompanyId: null,
          onboardingStatus: null,
          businessIdentity: {},
          bankingMode: null,
          selectedBankOptionId: null,
          savedBankAccounts: [],
          bankingDetails: null,
          uploadedDocuments: [],
          savedFingerprints: {},
        }),
    }),
    {
      name: "villeto-v2-onboarding",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : localStorage
      ),
      partialize: (state) => ({
        activeCompanyId: state.activeCompanyId,
        onboardingStatus: state.onboardingStatus,
        businessIdentity: state.businessIdentity,
        bankingMode: state.bankingMode,
        selectedBankOptionId: state.selectedBankOptionId,
        bankingDetails: state.bankingDetails,
        uploadedDocuments: state.uploadedDocuments,
        savedFingerprints: state.savedFingerprints,
      }),
    }
  )
);
