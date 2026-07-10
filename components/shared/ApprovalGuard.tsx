"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { PageSpinner } from "@/components/ui/Spinner";
import { isStatusActive } from "@/lib/utils";

/**
 * ApprovalGuard
 * Second layer of defense (client-side) — the edge middleware already
 * gates on the same rule, this just covers client-side navigations that
 * don't round-trip through middleware (e.g. client-side router.push).
 *
 * Gates on `status === "active"` (payment-enabled), not `approvalStatus`.
 * A vendor can be fully approved and still correctly land on /pending
 * while payment setup finishes — that's the intended UX, not a bug.
 * Rejected vendors are redirected too, but /pending renders a distinct
 * "rejected" panel for them rather than a generic waiting state.
 */
export function ApprovalGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;

    const shouldBlock = user && !isStatusActive(user.status) && pathname !== "/pending";

    if (shouldBlock) {
      setIsRedirecting(true);
      router.replace("/pending");
    } else {
      setIsRedirecting(false);
    }
  }, [user, isAuthenticated, isLoading, pathname, router]);

  if (isLoading || isRedirecting) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <PageSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
