"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "business-identity", label: "Business Identity" },
  { key: "banking", label: "Banking Details" },
  { key: "payment-terms", label: "Payment term" },
  { key: "documents", label: "Document Upload" },
  { key: "review", label: "Review & Submit" },
];

interface OnboardingStepperProps {
  currentStep: string;
  /** extra step shown after submit */
  pendingStep?: boolean;
  isRejected?: boolean;
  isPaymentSetup?: boolean;
  isPaymentTermsRejected?: boolean;
  companyId?: string;
  customSteps?: { key: string; label: string }[];
}

export function OnboardingStepper({
  currentStep,
  pendingStep = false,
  isRejected = false,
  isPaymentSetup = false,
  isPaymentTermsRejected = false,
  companyId,
  customSteps,
}: OnboardingStepperProps) {
  const router = useRouter();

  const pendingLabel = isPaymentTermsRejected
    ? "Terms Rejected"
    : isRejected
    ? "Rejected"
    : isPaymentSetup
    ? "Payment Setup"
    : "Under Review";

  const baseSteps = customSteps || STEPS;
  const steps = pendingStep
    ? [
        ...baseSteps.map((s) => ({
          ...s,
          completed: true,
          hasError: isPaymentTermsRejected && s.key === "payment-terms",
        })),
        { key: "pending", label: pendingLabel, completed: false, hasError: isRejected || isPaymentTermsRejected },
      ]
    : baseSteps;

  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="w-full max-w-4xl mx-auto mb-6 px-2 sm:px-4">
      <div className="flex items-center justify-between w-full">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx || (pendingStep && idx < steps.length - 1);
          const isCurrent = step.key === currentStep;
          const isLast = idx === steps.length - 1;
          const isClickable =
            step.key !== "pending" &&
            (isCompleted || isRejected || isPaymentTermsRejected || currentStep === "review" || (Boolean(companyId) && !pendingStep));

          return (
            <div key={step.key} className={cn("flex items-center", !isLast && "flex-1")}>
              {/* Step circle + label */}
              <div 
                className={cn(
                  "flex flex-col items-center gap-1.5 relative z-20 select-none shrink-0",
                  isClickable && "cursor-pointer hover:opacity-80 transition-opacity"
                )}
                onClick={() => {
                  if (isClickable) {
                    if (companyId) {
                      router.push(`/onboarding/${companyId}/${step.key}`);
                    } else {
                      router.push(`/onboarding/${step.key}`);
                    }
                  }
                }}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all shrink-0",
                    (step as any).hasError && step.key === "payment-terms"
                      ? "bg-red-500 border-red-500 text-white animate-pulse"
                      : isCompleted
                      ? "bg-primary border-primary text-white"
                      : isCurrent
                      ? pendingStep && step.key === "pending"
                        ? isRejected || isPaymentTermsRejected
                          ? "bg-red-500 border-red-500 text-white"
                          : isPaymentSetup
                          ? "bg-teal-600 border-teal-600 text-white"
                          : "bg-amber-500 border-amber-500 text-white"
                        : "bg-primary border-primary text-white"
                      : "border-border bg-white text-muted-foreground"
                  )}
                >
                  {isCompleted && !((step as any).hasError && step.key === "payment-terms") ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap text-center hidden sm:inline",
                    (step as any).hasError && step.key === "payment-terms"
                      ? "text-red-600 font-semibold"
                      : isCurrent
                      ? pendingStep && step.key === "pending"
                        ? isRejected || isPaymentTermsRejected
                          ? "text-red-600 font-semibold"
                          : isPaymentSetup
                          ? "text-teal-700 font-semibold"
                          : "text-amber-600 font-semibold"
                        : "text-primary"
                      : isCompleted
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-[2px] min-w-[12px] sm:min-w-[20px] mx-1 sm:mx-2.5 mb-0 sm:mb-5 transition-all",
                    idx < currentIdx
                      ? "bg-primary"
                      : "bg-border border-dashed"
                  )}
                  style={
                    idx >= currentIdx ? { borderTop: "2px dashed #e5e7eb" } : {}
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Mobile-only current step label, since the per-step text is hidden below sm */}
      <p className="sm:hidden text-center text-xs font-medium text-primary mt-2">
        Step {currentIdx + 1} of {steps.length}: {steps[currentIdx]?.label}
      </p>
    </div>
  );
}
