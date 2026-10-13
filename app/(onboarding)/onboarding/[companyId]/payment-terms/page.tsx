"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useCompanyOnboardingStore } from "@/lib/stores/companyOnboardingStore";
import { PaymentTermsForm, PaymentTermsValues } from "@/components/onboarding/PaymentTermsForm";

export default function PaymentTermsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useCompanyOnboardingStore();

  const handleContinue = (values: PaymentTermsValues) => {
    store.savePaymentTermsLocally(values);

    if (store.onboardingStatus?.documentsRequired) {
      router.push(`/onboarding/${companyId}/documents`);
    } else {
      router.push(`/onboarding/${companyId}/review`);
    }
  };

  return (
    <PaymentTermsForm
      initialValues={store.paymentTerms}
      onContinue={handleContinue}
      onBack={() => router.back()}
    />
  );
}
