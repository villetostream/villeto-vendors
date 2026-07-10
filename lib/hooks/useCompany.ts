"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { switchCompany as switchCompanyApi } from "@/lib/api/vendor";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";
import { broadcastAuthEvent, subscribeToAuthBroadcast } from "@/lib/utils/authBroadcast";
import { isStatusActive } from "@/lib/utils";

/**
 * useCompany — primary hook for multi-company context.
 *
 * Switching:
 * 1. Calls POST /vendors/me/switch-company
 * 2. Replaces the stored JWT with the fresh one (old token should stop
 *    working server-side from this point — confirm with backend; the
 *    frontend can't fully enforce that on its own)
 * 3. Updates auth + company store from the response's currentVendor
 * 4. Broadcasts the switch to any other open tabs
 * 5. Invalidates every query cached under the previous companyId
 *
 * Cross-tab: if another tab switches company (or logs out), this tab
 * reloads to the dashboard root rather than silently continuing to show
 * whatever it had on screen for a company that's no longer selected
 * anywhere — a hard interrupt, per the "vendor must never be unsure which
 * company they're working with" requirement, not a passive toast.
 */
export function useCompany() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const store = useCompanyStore();
  const { user, setCurrentVendor } = useAuthStore();

  useEffect(() => {
    const unsubscribe = subscribeToAuthBroadcast((event) => {
      if (event.type === "logout") {
        window.location.href = "/auth/login";
        return;
      }
      if (event.type === "company-switched" && event.companyId !== store.activeCompanyId) {
        toast.info(`Switched to ${event.companyName} in another tab — refreshing…`);
        window.location.href = "/dashboard";
      }
    });
    return unsubscribe;
  }, [store.activeCompanyId]);

  const switchCompany = useCallback(
    async (vendorId: string) => {
      const prevCompanyId = store.activeCompanyId;

      try {
        const result = await switchCompanyApi(vendorId);

        Cookies.set(AUTH_COOKIE_NAMES.authToken, result.accessToken, AUTH_COOKIE_OPTIONS);

        setCurrentVendor(result.currentVendor, result.companies);
        store.setCompanies(result.companies);
        store.setActive(result.currentVendor.companyId, result.currentVendor.vendorId);

        broadcastAuthEvent({
          type: "company-switched",
          companyId: result.currentVendor.companyId,
          companyName: result.currentVendor.companyName,
        });

        if (prevCompanyId) {
          queryClient.removeQueries({
            predicate: (query) => query.queryKey.includes(prevCompanyId),
          });
        }

        if (!isStatusActive(result.currentVendor.status)) {
          router.replace("/pending");
        } else {
          router.replace("/dashboard");
        }

        toast.success(`Now working with ${result.currentVendor.companyName}`);
      } catch {
        toast.error("Couldn't switch company. Please try again.");
      }
    },
    [queryClient, router, setCurrentVendor, store]
  );

  return {
    activeCompanyId: store.activeCompanyId,
    activeVendorId: store.activeVendorId,
    companies: store.companies,
    activeCompany: store.companies.find((c) => c.companyId === store.activeCompanyId) ?? null,
    isLoadingCompanies: store.isLoadingCompanies,
    setCompanies: store.setCompanies,
    switchCompany,
    currentUser: user,
  };
}
