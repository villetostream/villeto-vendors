/**
 * ORG STORE — LEGACY
 *
 * This store is a leftover from the original org-based design and has been
 * superseded by companyStore. It is no longer used by any page or component.
 * It is kept here to avoid removing files that may still be referenced in
 * older branches. New code should use @/lib/stores/companyStore.
 *
 * All external imports that no longer exist have been inlined below so this
 * file compiles cleanly without affecting anything.
 */

import { create } from "zustand";

// Inlined — ACTIVE_ORG_STORAGE_KEY was removed from @/lib/constants/auth
// when the multi-company JWT model replaced localStorage-based org selection.
const ACTIVE_ORG_STORAGE_KEY = "villeto_active_org_id";

// Inlined — Organization and OrgRole were removed from @/lib/types
// when the multi-company model replaced the old org model.
export type OrgRole = "admin" | "contributor" | "viewer";
export interface Organization {
  id: string;
  name: string;
  role: OrgRole;
  [key: string]: unknown;
}

export type OrgAction =
  | "create_invoice"
  | "view_orders"
  | "view_invoices"
  | "edit_profile"
  | "download_pdf";

const ROLE_PERMISSIONS: Record<OrgRole, OrgAction[]> = {
  admin: [
    "create_invoice",
    "view_orders",
    "view_invoices",
    "edit_profile",
    "download_pdf",
  ],
  contributor: [
    "create_invoice",
    "view_orders",
    "view_invoices",
    "download_pdf",
  ],
  viewer: ["view_orders", "view_invoices", "download_pdf"],
};

interface OrgState {
  organizations: Organization[];
  activeOrgId: string | null;
  activeOrg: Organization | null;
  isLoadingOrgs: boolean;

  setOrganizations: (orgs: Organization[]) => void;
  switchOrg: (orgId: string, invalidateQueryFn?: () => void) => void;
  setLoadingOrgs: (loading: boolean) => void;

  hasPermission: (action: OrgAction) => boolean;
}

function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function persistOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;
  if (orgId) {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
  } else {
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  }
}

export const useOrgStore = create<OrgState>((set, get) => ({
  organizations: [],
  activeOrgId: getStoredOrgId(),
  activeOrg: null,
  isLoadingOrgs: true,

  setOrganizations: (orgs) => {
    const storedId = getStoredOrgId();
    const activeOrgId =
      storedId && orgs.find((o) => o.id === storedId)
        ? storedId
        : orgs[0]?.id ?? null;

    const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
    persistOrgId(activeOrgId);

    set({ organizations: orgs, activeOrgId, activeOrg, isLoadingOrgs: false });
  },

  switchOrg: (orgId, invalidateQueryFn) => {
    const { organizations } = get();
    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;

    persistOrgId(orgId);
    set({ activeOrgId: orgId, activeOrg: org });

    if (invalidateQueryFn) {
      invalidateQueryFn();
    }
  },

  setLoadingOrgs: (loading) => set({ isLoadingOrgs: loading }),

  hasPermission: (action) => {
    const { activeOrg } = get();
    if (!activeOrg) return false;
    return ROLE_PERMISSIONS[activeOrg.role]?.includes(action) ?? false;
  },
}));

// ─────────────────────────────────────────────
// QUERY KEYS FACTORY (legacy — use companyStore queryKeys instead)
// ─────────────────────────────────────────────

export const queryKeys = {
  dashboardStats: (orgId: string) => ["dashboard", "stats", orgId] as const,
  orders: (orgId: string, filters = {}) => ["orders", orgId, filters] as const,
  order: (orgId: string, id: string) => ["orders", orgId, id] as const,
  invoices: (orgId: string, filters = {}) =>
    ["invoices", orgId, filters] as const,
  invoice: (orgId: string, id: string) => ["invoices", orgId, id] as const,
  profile: () => ["vendor", "profile"] as const,
  organizations: () => ["vendor", "organizations"] as const,
};
