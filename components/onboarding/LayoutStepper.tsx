"use client";

import { usePathname } from "next/navigation";
import { OnboardingStepper } from "./OnboardingStepper";

const PATHNAME_TO_STEP: Record<string, string> = {
  "/onboarding/business-identity": "business-identity",
  "/onboarding/banking": "banking",
  "/onboarding/documents": "documents",
  "/onboarding/review": "review",
};

const ONBOARDING_PATHS = new Set(Object.keys(PATHNAME_TO_STEP));

/**
 * Renders the OnboardingStepper only on pages that are part of the onboarding
 * wizard. Returns null on /invite, /signup, and other pages that share the
 * same layout but don't need the progress bar.
 */
export function LayoutStepper() {
  const pathname = usePathname();
  const step = PATHNAME_TO_STEP[pathname ?? ""];

  if (!step || !ONBOARDING_PATHS.has(pathname ?? "")) return null;

  const isPending = pathname === "/pending";

  return (
    <div className="shrink-0 border-b border-border/20 px-6 py-4 bg-transparent">
      <OnboardingStepper
        currentStep={step}
        pendingStep={isPending}
      />
    </div>
  );
}
