"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCompanyOnboardingStore, fingerprint } from "@/lib/stores/companyOnboardingStore";
import { PaymentTermsForm, PaymentTermsValues } from "@/components/onboarding/PaymentTermsForm";
import {
  useCompanyPaymentTermOptions,
  useVendorPaymentTerms,
  useSaveCompanyPaymentTerm,
  useMyCompany,
} from "@/lib/hooks/useVendorNetwork";
import { useAuthStore } from "@/lib/stores/authStore";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { toast } from "sonner";

export default function PaymentTermsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useCompanyOnboardingStore();

  const { data: options = [], isLoading: isLoadingOptions } =
    useCompanyPaymentTermOptions(companyId);

  // Fetch all payment terms so the vendor can reuse any approved or existing terms
  const { data: allTermsResponse } = useVendorPaymentTerms();
  const savedTerms = useMemo(() => {
    return allTermsResponse?.data || [];
  }, [allTermsResponse]);

  // Fetch current payment term for this specific company to detect rejection
  const { data: companyTermsResponse } = useVendorPaymentTerms({ companyId });
  const currentCompanyTerm = useMemo(() => {
    const terms = companyTermsResponse?.data || [];
    return terms.find((t) => t.isCurrent) || terms[0] || null;
  }, [companyTermsResponse]);

  // Fetch company relationship to detect approved+payment_terms_rejected state
  const { data: company } = useMyCompany(companyId);
  const authUser = useAuthStore((s) => s.user);
  const cookieApproval = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.approvalStatus) : undefined;

  // Determine if this is a "resubmit" scenario:
  // - The overall onboarding was approved (vendor is not in a "rejected" onboarding state)
  // - BUT the payment terms specifically were rejected
  const isOnboardingApproved =
    company?.approvalStatus === "approved" ||
    authUser?.approvalStatus === "approved" ||
    cookieApproval === "approved" ||
    company?.status === "Active" ||
    (company?.status ?? "").toLowerCase() === "active";

  const isPaymentTermRejected =
    currentCompanyTerm?.status === "rejected";

  const isResubmit = isOnboardingApproved && isPaymentTermRejected;

  // Editable ONLY when payment terms are specifically rejected.
  // Otherwise, if onboarding has been approved, payment terms are locked in read-only mode.
  const isReadOnly = isOnboardingApproved && !isPaymentTermRejected;

  // Also support the full-onboarding-rejected flow where the vendor is editing
  // payment terms as part of a broader resubmission
  const isFullOnboardingRejected =
    company?.approvalStatus === "rejected" ||
    company?.status === "rejected" ||
    (company as any)?.onboardingStatus === "rejected";

  const rejectionReason =
    currentCompanyTerm?.rejectionReason ||
    (isFullOnboardingRejected
      ? company?.decisionNote || (company as any)?.rejectionReason
      : null);

  const saveMutation = useSaveCompanyPaymentTerm();

  const handleContinue = async (values: PaymentTermsValues) => {
    if (isReadOnly) {
      router.push("/pending");
      return;
    }

    try {
      // The backend requires exactly ONE of these shapes — mixing fields
      // across modes causes a 400 "Choose one saved option..." error.
      let apiPayload: {
        optionId?: string;
        reusePaymentTermId?: string;
        name?: string;
        days?: number;
      } | null = null;

      if (values.reusePaymentTermId) {
        // Mode 1: reuse a previous payment term
        apiPayload = { reusePaymentTermId: values.reusePaymentTermId };
      } else if (values.optionId) {
        // Mode 2: select a company preset option (send ONLY optionId)
        apiPayload = { optionId: values.optionId };
      } else if (values.name || values.days !== undefined) {
        // Mode 3: custom terms — send ONLY name + days
        apiPayload = {
          name: values.name || "Custom Net",
          days: values.days ?? 0,
        };
      }

      if (apiPayload) {
        await saveMutation.mutateAsync({
          companyId,
          payload: apiPayload,
        });
        const fp = fingerprint({ ...apiPayload });
        store.markStepSaved("paymentTerms", fp);
      }

      store.savePaymentTermsLocally(values);

      if (isResubmit) {
        toast.success("Payment terms resubmitted successfully!");
        router.push("/pending");
        return;
      }

      if (store.onboardingStatus?.documentsRequired) {
        router.push(`/onboarding/${companyId}/documents`);
      } else {
        router.push(`/onboarding/${companyId}/review`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save payment terms");
    }
  };

  return (
    <PaymentTermsForm
      options={options}
      savedSubmissions={savedTerms}
      isLoadingOptions={isLoadingOptions}
      isLoading={saveMutation.isPending}
      initialValues={store.paymentTerms}
      onContinue={handleContinue}
      onBack={() => router.back()}
      isResubmit={isResubmit || isFullOnboardingRejected}
      rejectionReason={rejectionReason}
      readOnly={isReadOnly}
    />
  );
}
