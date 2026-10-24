"use client";

import { usePathname, useRouter } from "next/navigation";
import { OnboardingStepper } from "./OnboardingStepper";
import { useCompanyOnboardingStore } from "@/lib/stores/companyOnboardingStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { useMyCompany } from "@/lib/hooks/useVendorNetwork";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

const PATHNAME_TO_STEP: Record<string, string> = {
  "/onboarding/business-identity": "business-identity",
  "/onboarding/banking": "banking",
  "/onboarding/payment-terms": "payment-terms",
  "/onboarding/documents": "documents",
  "/onboarding/review": "review",
};

export function LayoutStepper() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const v2Store = useCompanyOnboardingStore();
  const authUser = useAuthStore((s) => s.user);
  
  let step = PATHNAME_TO_STEP[pathname];
  let companyId: string | undefined;
  
  if (!step) {
    const v2Match = pathname.match(/\/onboarding\/v2\/([^\/]+)\/([^\/]+)/);
    if (v2Match) {
      companyId = v2Match[1];
      step = v2Match[2];
    } else {
      const match = pathname.match(/\/onboarding\/([^\/]+)\/([^\/]+)/);
      if (match && match[1] && match[2]) {
        companyId = match[1];
        step = match[2];
      }
    }
  }

  const { data: company } = useMyCompany(companyId || "");
  const cookieApproval = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.approvalStatus) : undefined;
  const isApproved =
    company?.approvalStatus === "approved" ||
    authUser?.approvalStatus === "approved" ||
    cookieApproval === "approved";

  const isRejected =
    company?.approvalStatus === "rejected" ||
    company?.status === "rejected" ||
    authUser?.approvalStatus === "rejected";

  const validSteps = ["business-identity", "verification", "banking", "payment-terms", "documents", "review"];
  
  if (!step || !validSteps.includes(step)) return null;

  const isPending = pathname === "/pending" || pathname.endsWith("/pending");

  let customSteps = undefined;
  if (companyId && v2Store.onboardingStatus) {
    customSteps = [{ key: "business-identity", label: "Business Identity" }];
    if (v2Store.onboardingStatus.verificationRequested) {
      customSteps.push({ key: "verification", label: "Verification" });
    }
    customSteps.push({ key: "banking", label: "Banking Details" });
    customSteps.push({ key: "payment-terms", label: "Payment term" });
    if (v2Store.onboardingStatus.documentsRequired) {
      customSteps.push({ key: "documents", label: "Document Upload" });
    }
    customSteps.push({ key: "review", label: "Review & Submit" });
  }

  return (
    <div className="shrink-0 border-b border-border/20 px-6 py-4 bg-transparent">
      <OnboardingStepper
        currentStep={step}
        pendingStep={isPending}
        isRejected={isRejected}
        companyId={companyId}
        customSteps={customSteps}
      />
    </div>
  );
}
