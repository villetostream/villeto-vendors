"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import { getMe } from "@/lib/api/auth";
import Cookies from "js-cookie";

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth, setLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const token = Cookies.get("villeto_auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    getMe()
      .then((user) => {
        setUser(user);
        if (user.approvalStatus) {
          Cookies.set("villeto_approval_status", user.approvalStatus, {
            expires: 7,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
          });
        }
      })
      .catch(() => clearAuth());
  }, [setUser, clearAuth, setLoading]);

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
