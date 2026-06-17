"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Next.js renders this automatically if a render error is thrown anywhere
 * inside the (dashboard) segment tree, instead of crashing the whole app
 * to a white screen. `reset()` re-renders the segment from scratch.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // INTEGRATION POINT: send to an error-tracking service (Sentry, etc.)
    console.error("Dashboard segment error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-500" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-foreground mb-1">
        Something went wrong
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        An unexpected error occurred while loading this page. You can try
        again, or head back to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
