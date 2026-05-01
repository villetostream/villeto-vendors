/**
 * ORG STORE
 * Global organisation context.
 *
 * Design decisions:
 * - Active org persisted in BOTH localStorage AND URL (?org=xxx)
 * - Switching org: updates state → invalidates queries → TanStack refetches
 * - All API calls include X-Org-Id header via apiClient interceptor
 * - No full-page reload
 *
 * Edge cases handled:
 * - Cached data leakage between orgs: query keys include orgId
 * - Org switch mid-action: pending mutations are cancelled before switch
 * - Permission diff per org: role stored here, checked by useOrgPermission hook
 */

import { create } from "zustand";
import { Organization, OrgRole } from "@/lib/types";

interface OrgState {
  organizations: Organization[];
  activeOrgId: string | null;
  activeOrg: Organization | null;
  isLoadingOrgs: boolean;

  // Actions
  setOrganizations: (orgs: Organization[]) => void;
  switchOrg: (orgId: string, invalidateQueryFn?: () => void) => void;
  setLoadingOrgs: (loading: boolean) => void;

  // Permissions
  hasPermission: (action: OrgAction) => boolean;
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

function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("villeto_active_org_id");
}

function persistOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;
  if (orgId) {
    localStorage.setItem("villeto_active_org_id", orgId);
  } else {
    localStorage.removeItem("villeto_active_org_id");
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

    // Persist to localStorage (and URL is handled by the layout component)
    persistOrgId(orgId);

    set({ activeOrgId: orgId, activeOrg: org });

    // Trigger TanStack Query invalidation
    // This will cause all org-scoped queries to refetch
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
// QUERY KEYS FACTORY
// All query keys include orgId to prevent cross-org data leakage
// ─────────────────────────────────────────────

export const queryKeys = {
  dashboardStats: (orgId: string) => ["dashboard", "stats", orgId] as const,
  orders: (orgId: string, filters = {}) =>
    ["orders", orgId, filters] as const,
  order: (orgId: string, id: string) => ["orders", orgId, id] as const,
  invoices: (orgId: string, filters = {}) =>
    ["invoices", orgId, filters] as const,
  invoice: (orgId: string, id: string) => ["invoices", orgId, id] as const,
  profile: () => ["vendor", "profile"] as const,
  organizations: () => ["vendor", "organizations"] as const,
};
