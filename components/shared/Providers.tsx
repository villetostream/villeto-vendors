"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { getVendorCompanies, getVendorProfile } from "@/lib/api/vendor";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";
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

    const qc = getQueryClient();
    Promise.all([
      qc.ensureQueryData({ queryKey: queryKeys.profile(), queryFn: getVendorProfile }),
      qc.ensureQueryData({ queryKey: queryKeys.companies(), queryFn: getVendorCompanies }),
    ])
      .then(([profile, companies]) => {
        const activeCompanyId = Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId);
        const match = companies.find((c) => c.companyId === activeCompanyId) ?? companies[0];

        const effOnboarding = match?.onboardingStatus || profile.onboardingStatus;
        const effNextAction = (match as any)?.nextAction;
        const isAwaiting =
          (effOnboarding ?? "").toLowerCase() === "submitted" ||
          effNextAction === "awaiting_company_review";

        const effApproval = isAwaiting ? "pending" : (match?.approvalStatus || profile.approvalStatus);
        const note = isAwaiting
          ? null
          : ((match as any)?.decisionNote || (match as any)?.rejectionReason || profile.decisionNote);

        const user: AuthUser = {
          ...profileToAuthUser(profile),
          companyId: match?.companyId,
          companyName: match?.companyName,
          status: match?.status || profile.status,
          approvalStatus: effApproval,
          onboardingStatus: effOnboarding,
          decisionNote: note,
        };

        setUser(user);
        setCompanies(companies);
        qc.setQueryData(queryKeys.companies(), companies);
        qc.setQueryData(queryKeys.profile(), profile);
        if (match) {
          setActive(match.companyId, match.vendorId);
          if (effApproval) {
            Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, effApproval, AUTH_COOKIE_OPTIONS);
          }
          if (match.status) {
            Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, match.status, AUTH_COOKIE_OPTIONS);
          }
          if (note) {
            Cookies.set(AUTH_COOKIE_NAMES.decisionNote, note, AUTH_COOKIE_OPTIONS);
          } else {
            Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
          }
        }
      })
      .catch(() => {
        // Cookie existed but the session is no longer valid server-side.
        clearAuth();
        
        // Don't interrupt public flows like invite or signup.
        const isPublicRoute =
          pathname?.startsWith("/invite") ||
          pathname?.startsWith("/signup") ||
          pathname?.startsWith("/auth/login");
          
        if (!isPublicRoute) {
          const loginUrl = pathname ? `/auth/login?next=${encodeURIComponent(pathname)}` : "/auth/login";
          router.replace(loginUrl);
        }
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
          staleTime: 1000 * 60 * 2, // 2 minutes: reuse cache across onboarding steps and components
          gcTime: 1000 * 60 * 10,   // 10 minutes cache garbage collection time
          refetchOnWindowFocus: false, // Prevent request storms when switching tabs or inspecting DevTools
          refetchOnMount: false, // Don't refetch on component remount if data is still fresh (< 2 mins)
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
