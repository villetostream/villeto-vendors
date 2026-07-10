"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { getVendorCompanies, getVendorProfile } from "@/lib/api/vendor";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { AuthUser } from "@/lib/types";

function profileToAuthUser(profile: Awaited<ReturnType<typeof getVendorProfile>>): AuthUser {
  return {
    id: profile.vendorId,
    email: profile.email,
    business_name: profile.displayName || profile.legalName,
    status: profile.status,
    approvalStatus: profile.approvalStatus,
    onboardingStatus: profile.onboardingStatus,
    decisionNote: profile.decisionNote,
    isPaymentEnabled: profile.isPaymentEnabled,
  };
}

/**
 * Rehydrates session state on hard page load / refresh, when the store is
 * empty but a valid auth token cookie still exists. Two calls, run in
 * parallel: the profile of whichever company the current token is scoped
 * to, and the full company list (for the switcher). Neither depends on
 * "/auth/me", which isn't a real endpoint in the vendor-portal API.
 */
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth, setLoading } = useAuthStore();
  const { setCompanies, setActive } = useCompanyStore();
  const initialized = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const token = Cookies.get(AUTH_COOKIE_NAMES.authToken);
    if (!token) {
      setLoading(false);
      return;
    }

    Promise.all([getVendorProfile(), getVendorCompanies()])
      .then(([profile, companies]) => {
        const user = profileToAuthUser(profile);
        setUser(user);
        setCompanies(companies);
        const activeCompanyId = Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId);
        const match = companies.find((c) => c.companyId === activeCompanyId) ?? companies[0];
        if (match) setActive(match.companyId, match.vendorId);
      })
      .catch(() => {
        // Cookie existed but the session is no longer valid server-side.
        clearAuth();
        const loginUrl =
          pathname && pathname !== "/auth/login"
            ? `/auth/login?next=${encodeURIComponent(pathname)}`
            : "/auth/login";
        router.replace(loginUrl);
      });
  }, [setUser, setCompanies, setActive, clearAuth, setLoading, router, pathname]);

  return <>{children}</>;
}

let queryClient: QueryClient;

function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          staleTime: 1000 * 60,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return queryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();

  return (
    <QueryClientProvider client={client}>
      <AuthInitializer>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            style: {
              fontFamily: "var(--font-geist-sans)",
            },
          }}
        />
      </AuthInitializer>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
