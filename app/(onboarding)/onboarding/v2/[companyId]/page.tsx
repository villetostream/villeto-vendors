"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStatus, useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { PageSpinner } from "@/components/ui/Spinner";

export default function V2OnboardingRouter({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const setActiveCompanyId = useV2OnboardingStore((s) => s.setActiveCompanyId);
  const setOnboardingStatus = useV2OnboardingStore((s) => s.setOnboardingStatus);
  const setUploadedDocumentsLocally = useV2OnboardingStore((s) => s.setUploadedDocumentsLocally);
  const saveBusinessIdentityLocally = useV2OnboardingStore((s) => s.saveBusinessIdentityLocally);
  const saveBankingDetailsLocally = useV2OnboardingStore((s) => s.saveBankingDetailsLocally);
  const user = useAuthStore((s) => s.user);
  // onboardingMode comes from the switch-company response (hydrated into the
  // onboarding store by useCompany) — the my-company endpoint doesn't return it.
  const sessionOnboardingMode = useOnboardingStore((s) => s.onboardingMode);
  
  const { data: status, isLoading: loadingStatus, error: statusError } = useOnboardingStatus(companyId);
  const { data: company, isLoading: loadingCompany, error: companyError } = useMyCompany(companyId);

  useEffect(() => {
    if (status && company && companyId) {
      // Initialize the store for this company
      setActiveCompanyId(companyId);
      setOnboardingStatus(status);
      
      if (company.documents && Array.isArray(company.documents)) {
        const docs = company.documents.map((d: any) => ({
          id: d.documentType,
          name: d.originalName || `${d.documentType}.pdf`,
          url: d.fileUrl || (d.viewEndpoint ? `https://api.villeto.com${d.viewEndpoint}` : ""),
        }));
        setUploadedDocumentsLocally(docs);
      }

      if (company.businessDetails) {
        saveBusinessIdentityLocally({
          businessName: company.businessDetails.legalName || company.businessDetails.displayName || "",
          email: company.businessDetails.email || "",
          registrationNumber: company.businessDetails.registrationNumber || "",
          country: company.businessDetails.country || "",
          businessAddress: company.businessDetails.businessAddress || "",
        });
      }

      if (company.bankingDetails && (company.bankingDetails.bankName || company.bankingDetails.maskedAccountNumber || company.bankingDetails.accountName)) {
        saveBankingDetailsLocally({
          bankName: company.bankingDetails.bankName || "",
          accountNumber: company.bankingDetails.maskedAccountNumber || "",
          accountName: company.bankingDetails.accountName || "",
        });
      }

      const companyAny = company as typeof company & { onboardingMode?: string };
      const onboardingStatusStr = (company.onboardingStatus || user?.onboardingStatus || "").toLowerCase();

      // Profile reuse: the vendor's existing profile is pre-filled, but they
      // must still confirm every step, so always start at Business Identity.
      const isProfileReuse =
        sessionOnboardingMode === "profile_reuse_review" ||
        companyAny.onboardingMode === "profile_reuse_review" ||
        company.onboardingMethod === "profile_reuse" ||
        onboardingStatusStr === "profile_review" ||
        (company.nextAction as string | null | undefined) === "review_and_submit";

      // If they haven't accepted the invite yet, bounce them to the invite page
      if (
        company.nextAction === "accept_invitation" || 
        company.onboardingStatus?.toLowerCase() === "invited" ||
        status.nextAction === "accept_invitation" ||
        status.accessState === "invitation_pending"
      ) {
        router.replace(`/invitation/${companyId}`);
        return;
      }

      // Determine the correct step based on backend progress
      const target = (company.currentStep || company.onboardingStatus || "").toLowerCase();
      
      let stepPath = "business-identity";
      
      if (isProfileReuse) {
        stepPath = "business-identity";
      } else if (target === "review") {
        stepPath = "review";
      } else if (target.includes("document")) {
        stepPath = "documents";
      } else if (target.includes("banking")) {
        stepPath = "banking";
      } else if (status.canSubmit) {
        stepPath = "review";
      }
      
      // Navigate to the correct step
      router.replace(`/onboarding/v2/${companyId}/${stepPath}`);
    }
  }, [status, company, companyId, router, setActiveCompanyId, setOnboardingStatus, setUploadedDocumentsLocally, saveBusinessIdentityLocally, saveBankingDetailsLocally, sessionOnboardingMode, user?.currentStep, user?.onboardingStatus]);

  if (loadingStatus || loadingCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <PageSpinner />
        <p className="text-sm text-muted-foreground">Loading onboarding progress...</p>
      </div>
    );
  }

  if (statusError || companyError) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load onboarding status. Please try again.
      </div>
    );
  }

  return null;
}
