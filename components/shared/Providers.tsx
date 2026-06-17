"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { getMe } from "@/lib/api/auth";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth, setLoading } = useAuthStore();
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

    getMe()
      .then((user) => {
        setUser(user);
        if (user.approvalStatus) {
          Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, user.approvalStatus, AUTH_COOKIE_OPTIONS);
        }
      })
      .catch(() => {
        // Cookie existed but the session is no longer valid server-side
        // (expired/revoked token). Clear local state AND send the vendor
        // back to login instead of leaving them on a half-authenticated,
        // broken-looking page with no way back in.
        clearAuth();
        const loginUrl = pathname && pathname !== "/auth/login"
          ? `/auth/login?next=${encodeURIComponent(pathname)}`
          : "/auth/login";
        router.replace(loginUrl);
      });
  }, [setUser, clearAuth, setLoading, router, pathname]);

  return <>{children}</>;
}

let queryClient: QueryClient;

function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          staleTime: 1000 * 60, // 1 min default
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
