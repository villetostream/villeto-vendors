"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useOrgStore, queryKeys, type OrgAction } from "@/lib/stores/orgStore";
import { useCallback } from "react";

/**
 * useOrg — primary hook for org context.
 *
 * Provides:
 * - activeOrg: current org object
 * - organizations: all orgs for this vendor
 * - switchOrg(id): switches context + invalidates queries
 * - hasPermission(action): role-based permission check
 */
export function useOrg() {
  const queryClient = useQueryClient();
  const store = useOrgStore();

  const switchOrg = useCallback(
    (orgId: string) => {
      const prevOrgId = store.activeOrgId;

      // Cancel any in-flight queries for the old org to prevent
      // data leakage / race conditions
      if (prevOrgId) {
        queryClient.cancelQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && key.includes(prevOrgId);
          },
        });
      }

      // Switch org in store + persist to localStorage
      store.switchOrg(orgId, () => {
        // Invalidate all org-scoped queries
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            // Invalidate anything scoped to the new orgId
            return Array.isArray(key) && key.includes(orgId);
          },
        });

        // Also invalidate dashboard/stats which use org context
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboardStats(orgId),
        });
        queryClient.invalidateQueries({
          queryKey: ["orders", orgId],
        });
        queryClient.invalidateQueries({
          queryKey: ["invoices", orgId],
        });
      });

      // Update URL param for shareability (shallow, no reload)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("org", orgId);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [queryClient, store]
  );

  return {
    activeOrg: store.activeOrg,
    activeOrgId: store.activeOrgId,
    organizations: store.organizations,
    isLoadingOrgs: store.isLoadingOrgs,
    setOrganizations: store.setOrganizations,
    switchOrg,
    hasPermission: store.hasPermission,
  };
}

/**
 * useOrgPermission — simple permission check hook.
 */
export function useOrgPermission(action: OrgAction) {
  const hasPermission = useOrgStore((s) => s.hasPermission);
  return hasPermission(action);
}
