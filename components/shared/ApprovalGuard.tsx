"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { PageSpinner } from "@/components/ui/Spinner";

/**
 * ApprovalGuard
 * Second layer of defense (client-side) to ensure only approved vendors see dashboard content.
 * Redirects to /pending if the user is authenticated but not yet approved.
 */
export function ApprovalGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Wait for auth to initialize
    if (isLoading) return;

    // If not authenticated, the middleware should handle it, but we can be safe:
    if (!isAuthenticated) return;

    // If authenticated but not approved, redirect to /pending
    if (user && user.approvalStatus !== "approved" && pathname !== "/pending") {
      setIsRedirecting(true);
      router.replace("/pending");
    } else {
      setIsRedirecting(false);
    }
  }, [user, isAuthenticated, isLoading, pathname, router]);

  // Show spinner while checking or redirecting
  if (isLoading || isRedirecting) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <PageSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
