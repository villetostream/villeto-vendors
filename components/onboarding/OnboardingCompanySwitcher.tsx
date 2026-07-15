"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Check, Loader2, LogOut } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { getVendorCompanies, switchCompany as switchCompanyApi } from "@/lib/api/vendor";
import { logout } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { cn, getCompanyStatusConfig, getInitials, isStatusActive } from "@/lib/utils";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";
import { toast } from "sonner";

const ONBOARDING_STEP_ROUTES: Record<string, string> = {
  business_identity: "business-identity",
  banking_details: "banking",
  documents: "documents",
  review: "review",
};

/**
 * Company switcher for the onboarding/pending shell.
 *
 * Shows only if the vendor belongs to more than one company.
 * On switch:
 *   - Active company → /dashboard
 *   - Onboarding (approvalStatus null, not submitted) → /onboarding/<step>
 *   - Pending/rejected → /pending
 */
export function OnboardingCompanySwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { setCurrentVendor, clearAuth } = useAuthStore();
  const hydrateFromSession = useOnboardingStore((s) => s.hydrateFromSession);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const setStoreCompanies = useCompanyStore((s) => s.setCompanies);
  const companies = useCompanyStore((s) => s.companies);
  const activeCompanyId = useCompanyStore((s) => s.activeCompanyId);
  const setActive = useCompanyStore((s) => s.setActive);

  const { data } = useQuery({
    queryKey: queryKeys.companies(),
    queryFn: getVendorCompanies,
    staleTime: 1000 * 30,
    // Only fetch if the user actually has an auth token — the OnboardingLayout
    // renders this component on /invite and /signup too where no token exists,
    // and a 401 from those pages triggers the global session-expired redirect.
    enabled: !!Cookies.get(AUTH_COOKIE_NAMES.authToken),
  });

  useEffect(() => {
    if (data) setStoreCompanies(data);
  }, [data, setStoreCompanies]);

  const activeCompany = companies.find((c) => c.companyId === activeCompanyId) ?? null;
  const activeStatusConfig = activeCompany
    ? getCompanyStatusConfig(activeCompany.status, activeCompany.approvalStatus)
    : null;

  const handleSwitch = async (vendorId: string, companyId: string) => {
    if (companyId === activeCompanyId || switchingTo) return;
    setSwitchingTo(vendorId);

    try {
      const result = await switchCompanyApi(vendorId);

      Cookies.set(AUTH_COOKIE_NAMES.authToken, result.accessToken, AUTH_COOKIE_OPTIONS);
      setCurrentVendor(result.currentVendor, result.companies);
      setStoreCompanies(result.companies);
      setActive(result.currentVendor.companyId, result.currentVendor.vendorId);

      toast.success(`Switched to ${result.currentVendor.companyName}`);

      const vendor = result.currentVendor;

      // Active → dashboard
      if (isStatusActive(vendor.status)) {
        router.replace("/dashboard");
        return;
      }

      // Submitted (approvalStatus is set) → pending page
      if (vendor.approvalStatus !== null) {
        router.replace("/pending");
        return;
      }

      // Still in onboarding wizard → hydrate store and go to current step
      hydrateFromSession({
        vendorId: vendor.vendorId,
        email: vendor.email,
        legalName: vendor.legalName,
        displayName: vendor.displayName,
        businessIdentity: vendor.businessIdentity,
      });

      const step = vendor.currentStep || "business_identity";
      const route = ONBOARDING_STEP_ROUTES[step] || "business-identity";
      router.replace(`/onboarding/${route}`);
    } catch {
      toast.error("Couldn't switch company. Please try again.");
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      queryClient.clear();
      clearAuth();
      router.push("/auth/login");
    } catch {
      toast.error("Failed to log out");
    }
  };

  if (!companies || companies.length === 0) return null;
  if (pathname === "/invite" || pathname === "/signup") return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-white hover:bg-muted/50 transition-colors text-sm font-medium text-foreground min-w-0 shadow-sm"
          aria-label="Switch company"
        >
          <span className="truncate max-w-[130px]">
            {activeCompany?.companyName ?? "Select company"}
          </span>
          {activeStatusConfig && (
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                activeStatusConfig.color,
                activeStatusConfig.bg
              )}
            >
              {activeStatusConfig.label}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[260px] overflow-hidden rounded-xl border border-border bg-white shadow-lg p-1 animate-in fade-in-0 zoom-in-95"
          sideOffset={6}
          align="end"
        >
          {companies.length > 1 && (
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
              Switch organisation
            </div>
          )}

          {companies.length > 1 && companies.map((company) => {
            const isActive = company.companyId === activeCompanyId;
            const statusConfig = getCompanyStatusConfig(company.status, company.approvalStatus);
            const isSwitching = switchingTo === company.vendorId;

            return (
              <DropdownMenu.Item
                key={company.vendorId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer outline-none transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-foreground"
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  handleSwitch(company.vendorId, company.companyId);
                }}
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {getInitials(company.companyName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{company.companyName}</p>
                  <span
                    className={cn(
                      "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5",
                      statusConfig.color,
                      statusConfig.bg
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </div>
                {isSwitching ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary shrink-0"
                    aria-hidden="true"
                  />
                ) : isActive ? (
                  <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenu.Item>
            );
          })}

          {companies.length > 1 && <DropdownMenu.Separator className="h-px bg-border my-1" />}

          <DropdownMenu.Item
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer outline-none transition-colors"
            onSelect={(e) => {
              e.preventDefault();
              handleLogout();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
