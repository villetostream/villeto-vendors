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

/** Shape of the validated invite coming from POST /vendors/invitations/preview */
export interface InviteContext {
  token: string;
  vendorId: string;
  vendorInvitationId: string;
  email: string;
  displayName: string;
  legalName: string;
}

interface OnboardingState {
  currentStep: OnboardingStep;

  // Invite context (set after /invite page validates the token)
  inviteToken: string | null;
  vendorId: string | null;
  vendorInvitationId: string | null;
  vendorEmail: string | null;
  /** Display name from the invitation (e.g. "Acme Supplies") */
  businessName: string | null;
  /** Legal / registered name (e.g. "Acme Supplies Limited") */
  legalBusinessName: string | null;

  // Step data
  businessIdentity: Partial<BusinessIdentityForm>;
  banking: Partial<BankingDetailsForm & { bank_code: string }>;
  documents: DocumentState[];

  // Verification results
  bankResolvedName: string | null;
  bankMatchScore: number | null;
  bankFlagged: boolean;

  // Actions
  setInviteContext: (ctx: InviteContext) => void;
  setStep: (step: OnboardingStep) => void;
  saveBusinessIdentity: (data: BusinessIdentityForm) => void;
  saveBanking: (
    data: BankingDetailsForm & { bank_code: string },
    resolvedName: string,
    matchScore: number
  ) => void;
  updateDocument: (type: DocumentType, update: Partial<DocumentState>) => void;
  /** Hydrate store after login — fills vendor identity + any partial step data from the session */
  hydrateFromSession: (session: {
    vendorId: string;
    email: string;
    legalName: string;
    displayName: string;
    businessIdentity?: {
      businessName?: string | null;
      email?: string | null;
      registrationNumber?: string | null;
      country?: string | null;
      businessAddress?: string | null;
    } | null;
  }) => void;
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
    type: "bank_document",
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
      vendorId: null,
      vendorInvitationId: null,
      vendorEmail: null,
      businessName: null,
      legalBusinessName: null,
      businessIdentity: {},
      banking: {},
      documents: DEFAULT_DOCUMENTS,
      bankResolvedName: null,
      bankMatchScore: null,
      bankFlagged: false,

      setInviteContext: (ctx) =>
        set({
          inviteToken: ctx.token,
          vendorId: ctx.vendorId,
          vendorInvitationId: ctx.vendorInvitationId,
          vendorEmail: ctx.email,
          businessName: ctx.displayName,
          legalBusinessName: ctx.legalName,
        }),

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

      hydrateFromSession: (session) =>
        set((state) => {
          const isNewVendor = state.vendorId && state.vendorId !== session.vendorId;
          const current = isNewVendor ? {} : state.businessIdentity;

          return {
            vendorId: session.vendorId,
            vendorEmail: session.email,
            businessName: session.displayName,
            legalBusinessName: session.legalName,
            // Prefer server data if present, fallback to local state (if same vendor), then defaults
            businessIdentity: {
              business_name:
                session.businessIdentity?.businessName ||
                current.business_name ||
                session.legalName ||
                session.displayName ||
                "",
              business_email:
                session.businessIdentity?.email ||
                current.business_email ||
                session.email ||
                "",
              registration_number:
                session.businessIdentity?.registrationNumber ||
                current.registration_number ||
                "",
              country:
                session.businessIdentity?.country ||
                current.country ||
                "",
              business_address:
                session.businessIdentity?.businessAddress ||
                current.business_address ||
                "",
            },
            ...(isNewVendor
              ? {
                  banking: {},
                  documents: DEFAULT_DOCUMENTS,
                  bankResolvedName: null,
                  bankMatchScore: null,
                  bankFlagged: false,
                }
              : {}),
          };
        }),

      reset: () =>
        set({
          currentStep: "business-identity",
          inviteToken: null,
          vendorId: null,
          vendorInvitationId: null,
          vendorEmail: null,
          businessName: null,
          legalBusinessName: null,
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
      // Persist step progress and form data but NOT sensitive invite identifiers
      partialize: (state) => ({
        currentStep: state.currentStep,
        businessIdentity: state.businessIdentity,
        banking: state.banking,
        documents: state.documents,
        bankResolvedName: state.bankResolvedName,
        bankMatchScore: state.bankMatchScore,
        bankFlagged: state.bankFlagged,
      }),
      // Bump version whenever persisted shape changes to trigger migrate()
      version: 2,
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as Record<string, unknown>;
        // v1 → v2: rename bank_doc → bank_document
        if (fromVersion < 2 && Array.isArray(state.documents)) {
          state.documents = (state.documents as Array<Record<string, unknown>>).map((doc) =>
            doc.type === "bank_doc" ? { ...doc, type: "bank_document" } : doc
          );
        }
        return state;
      },
    }
  )
);
