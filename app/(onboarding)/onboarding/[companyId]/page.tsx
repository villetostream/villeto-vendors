"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStatus, useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { useCompanyOnboardingStore } from "@/lib/stores/companyOnboardingStore";
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
  const setActiveCompanyId = useCompanyOnboardingStore((s) => s.setActiveCompanyId);
  const setOnboardingStatus = useCompanyOnboardingStore((s) => s.setOnboardingStatus);
  const setUploadedDocumentsLocally = useCompanyOnboardingStore((s) => s.setUploadedDocumentsLocally);
  const saveBusinessIdentityLocally = useCompanyOnboardingStore((s) => s.saveBusinessIdentityLocally);
  const saveBankingDetailsLocally = useCompanyOnboardingStore((s) => s.saveBankingDetailsLocally);
  const user = useAuthStore((s) => s.user);
  // onboardingMode comes from the switch-company response (hydrated into the
  // onboarding store by useCompany) — the my-company endpoint doesn't return it.
  const sessionOnboardingMode = useOnboardingStore((s) => s.onboardingMode);
  
  const { data: status, isLoading: loadingStatus, error: statusError } = useOnboardingStatus(companyId);
  const { data: company, isLoading: loadingCompany, error: companyError } = useMyCompany(companyId);

  useEffect(() => {
    // If both queries are done (not loading), proceed — company may be null for
    // brand-new vendors whose company record isn't on the vendor-network side yet.
    if (!loadingStatus && !loadingCompany && companyId) {
      // If the onboarding status API also errored, fall back immediately to
      // business-identity rather than showing a stuck error screen.
      if (statusError) {
        router.replace(`/onboarding/${companyId}/business-identity`);
        return;
      }

      if (status) {
        setActiveCompanyId(companyId);
        setOnboardingStatus(status);
      }

      // company can be null if the backend hasn't created the vendor-network
      // record yet (brand-new vendor, just accepted invite, first login).
      // In that case we always start at business-identity.
      if (!company) {
        router.replace(`/onboarding/${companyId}/business-identity`);
        return;
      }

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
        status?.nextAction === "accept_invitation" ||
        status?.accessState === "invitation_pending"
      ) {
        router.replace(`/invitation/${companyId}`);
        return;
      }

      // Determine the correct step based on backend progress.
      // Also consider the onboardingStatus from auth store as a fallback (comes
      // from the /vendors/me/companies list which is always populated).
      const target = (
        company.currentStep ||
        company.onboardingStatus ||
        user?.onboardingStatus ||
        ""
      ).toLowerCase();

      const isRejected =
        company.approvalStatus === "rejected" ||
        company.status === "rejected" ||
        (company as any).onboardingStatus === "rejected" ||
        user?.approvalStatus === "rejected";
      
      let stepPath = "business-identity";
      
      if (isRejected) {
        // Rejected vendors land on review to see rejection feedback and jump to any step to edit
        stepPath = "review";
      } else if (isProfileReuse) {
        stepPath = "business-identity";
      } else if (target === "review") {
        stepPath = "review";
      } else if (target.includes("document")) {
        stepPath = "documents";
      } else if (target.includes("payment")) {
        stepPath = "payment-terms";
      } else if (target.includes("banking")) {
        stepPath = "banking";
      } else if (status?.canSubmit) {
        stepPath = "review";
      }
      
      // Navigate to the correct step
      router.replace(`/onboarding/${companyId}/${stepPath}`);
    }
  }, [status, company, companyId, router, loadingStatus, loadingCompany, statusError, setActiveCompanyId, setOnboardingStatus, setUploadedDocumentsLocally, saveBusinessIdentityLocally, saveBankingDetailsLocally, sessionOnboardingMode, user?.currentStep, user?.onboardingStatus, user?.approvalStatus]);

  if (loadingStatus || loadingCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <PageSpinner />
        <p className="text-sm text-muted-foreground">Loading onboarding progress...</p>
      </div>
    );
  }

  return null;
}
