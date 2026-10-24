"use client";

import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { PaymentTermsForm, PaymentTermsValues } from "@/components/onboarding/PaymentTermsForm";

export default function PaymentTermsPage() {
  const router = useRouter();
  const store = useOnboardingStore();

  const handleContinue = (values: PaymentTermsValues) => {
    store.savePaymentTerms({
      ...values,
      arrangement: values.arrangement || values.name || "Payment within a specified number of days",
    });
    router.push("/onboarding/documents");
  };

  return (
    <PaymentTermsForm
      initialValues={store.paymentTerms}
      onContinue={handleContinue}
      onBack={() => router.back()}
    />
  );
}
