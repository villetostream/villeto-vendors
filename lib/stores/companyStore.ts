/**
 * COMPANY STORE
 * Tracks which tenant-company relationship is currently selected.
 *
 * Replaces the old orgStore/X-Org-Id-header design. Company context now
 * lives in the JWT (companyId claim) — this store just mirrors it in
 * memory for synchronous reads (e.g. building query keys) and persists
 * the *id* to a cookie so a page refresh can restore which company was
 * selected before the auth-init round trip completes.
 */

import { create } from "zustand";
import { CompanyRelationship } from "@/lib/types";
import Cookies from "js-cookie";
import { subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

interface CompanyState {
  companies: CompanyRelationship[];
  activeCompanyId: string | null; // = companyId, not vendorId
  activeVendorId: string | null; // company-specific vendor row id — what switch-company takes
  isLoadingCompanies: boolean;
  dateRange: DateRange | undefined;

  setCompanies: (companies: CompanyRelationship[]) => void;
  setActive: (companyId: string, vendorId: string) => void;
  setLoadingCompanies: (loading: boolean) => void;
  setDateRange: (range: DateRange | undefined) => void;
}

function getStoredCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId) ?? null;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  companies: [],
  activeCompanyId: getStoredCompanyId(),
  activeVendorId: null,
  isLoadingCompanies: true,
  dateRange: {
    from: subDays(new Date(), 30),
    to: new Date(),
  },

  setCompanies: (companies) => set({ companies, isLoadingCompanies: false }),

  setActive: (companyId, vendorId) => {
    Cookies.set(AUTH_COOKIE_NAMES.activeCompanyId, companyId, AUTH_COOKIE_OPTIONS);
    set({ activeCompanyId: companyId, activeVendorId: vendorId });
  },

  setLoadingCompanies: (loading) => set({ isLoadingCompanies: loading }),
  setDateRange: (range) => set({ dateRange: range }),
}));

// ─────────────────────────────────────────────
// QUERY KEYS — namespaced by companyId so switching never leaks cached
// data from one company into another, and so cross-tab company changes
// naturally miss the old cache instead of showing stale data.
// ─────────────────────────────────────────────

export const queryKeys = {
  summary: (companyId: string, filters: { startDate?: string; endDate?: string } = {}) => 
    ["vendor-portal", "summary", companyId, filters] as const,
  // "list" discriminator keeps list queries distinct from detail queries so
  // invalidateQueries({ queryKey: ordersList(id) }) doesn't accidentally
  // trigger a background refetch of the open order detail page.
  ordersList: (companyId: string) => ["vendor-portal", "orders", companyId, "list"] as const,
  orders: (companyId: string, filters = {}) => ["vendor-portal", "orders", companyId, "list", filters] as const,
  order: (companyId: string, id: string) => ["vendor-portal", "orders", companyId, "detail", id] as const,
  invoices: (companyId: string, filters = {}) => ["vendor-portal", "invoices", companyId, filters] as const,
  invoice: (companyId: string, id: string) => ["vendor-portal", "invoices", companyId, id] as const,
  profile: (companyId: string) => ["vendor-portal", "profile", companyId] as const,
  companies: () => ["vendors", "me", "companies"] as const,
  notifications: (companyId: string, filters = {}) =>
    ["vendor-portal", "notifications", companyId, filters] as const,
  unreadCount: (companyId: string) => ["vendor-portal", "notifications", "unread-count", companyId] as const,
};
