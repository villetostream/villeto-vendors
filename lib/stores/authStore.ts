/**
 * AUTH STORE
 * Global authentication + current-company identity state.
 * Token/company/status persisted to cookies; full objects kept in memory.
 */

import { create } from "zustand";
import { AuthUser, CompanyRelationship, CurrentVendor } from "@/lib/types";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

interface AuthState {
  user: AuthUser | null;
  companies: CompanyRelationship[];
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: AuthUser) => void;
  setCompanies: (companies: CompanyRelationship[]) => void;
  /** Applies a CurrentVendor context from login/switch-company in one go. */
  setCurrentVendor: (vendor: CurrentVendor, companies: CompanyRelationship[]) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

function currentVendorToAuthUser(v: CurrentVendor, companies?: CompanyRelationship[]): AuthUser {
  const match = companies?.find((c) => c.companyId === v.companyId) || companies?.[0];
  const effectiveStatus = match?.status ?? v.status;
  const effectiveOnboarding = match?.onboardingStatus ?? v.onboardingStatus;
  const effectiveNextAction = (match as any)?.nextAction ?? (v as any)?.nextAction;
  const isAwaiting =
    (effectiveOnboarding ?? "").toLowerCase() === "submitted" ||
    effectiveNextAction === "awaiting_company_review";

  const effectiveApproval = isAwaiting ? "pending" : (match?.approvalStatus ?? v.approvalStatus);
  const effectiveDecisionNote = isAwaiting
    ? null
    : ((match as any)?.decisionNote || (match as any)?.rejectionReason || v.decisionNote);

  return {
    id: v.vendorId,
    vendorAccountId: v.vendorAccountId,
    companyId: v.companyId || match?.companyId,
    companyName: match?.companyName || v.companyName,
    email: v.email,
    business_name: v.displayName || v.legalName,
    status: effectiveStatus,
    approvalStatus: effectiveApproval,
    onboardingStatus: effectiveOnboarding,
    decisionNote: effectiveDecisionNote,
    isPaymentEnabled: match?.isPaymentEnabled ?? v.isPaymentEnabled,
    currentStep: v.currentStep,
  };
}

function persistSessionCookies(user: AuthUser) {
  if (user.approvalStatus) {
    Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, user.approvalStatus, AUTH_COOKIE_OPTIONS);
  } else {
    // Explicitly clear a stale approvalStatus cookie from a previous session —
    // middleware reads this cookie to decide whether to redirect to /pending or
    // to the onboarding wizard, so a leftover value would send mid-onboarding
    // vendors to /pending instead of their current step.
    Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
  }
  if (user.status) {
    Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, user.status, AUTH_COOKIE_OPTIONS);
  }
  if (user.companyId) {
    Cookies.set(AUTH_COOKIE_NAMES.activeCompanyId, user.companyId, AUTH_COOKIE_OPTIONS);
  }
  if (user.decisionNote) {
    Cookies.set(AUTH_COOKIE_NAMES.decisionNote, user.decisionNote, AUTH_COOKIE_OPTIONS);
  } else {
    Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  companies: [],
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => {
    persistSessionCookies(user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  setCompanies: (companies) => set({ companies }),

  setCurrentVendor: (vendor, companies) => {
    const user = currentVendorToAuthUser(vendor, companies);
    persistSessionCookies(user);
    set({ user, companies, isAuthenticated: true, isLoading: false });
  },

  clearAuth: () => {
    Cookies.remove(AUTH_COOKIE_NAMES.authToken);
    Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
    Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
    Cookies.remove(AUTH_COOKIE_NAMES.vendorStatus);
    Cookies.remove(AUTH_COOKIE_NAMES.activeCompanyId);
    Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
    if (typeof window !== "undefined") {
      localStorage.removeItem("villeto-onboarding");
      sessionStorage.removeItem("villeto-onboarding");
    }
    set({ user: null, companies: [], isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
