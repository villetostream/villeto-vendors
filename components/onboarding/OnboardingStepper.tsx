"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "business-identity", label: "Business Identity" },
  { key: "banking", label: "Banking Details" },
  { key: "documents", label: "Document Upload" },
  { key: "review", label: "Review & Submit" },
];

interface OnboardingStepperProps {
  currentStep: string;
  /** extra step shown after submit */
  pendingStep?: boolean;
  isRejected?: boolean;
}

export function OnboardingStepper({
  currentStep,
  pendingStep = false,
  isRejected = false,
}: OnboardingStepperProps) {
  const router = useRouter();

  const steps = pendingStep
    ? [
        ...STEPS.map((s) => ({ ...s, completed: true })),
        { key: "pending", label: isRejected ? "Rejected" : "Under Review", completed: false },
      ]
    : STEPS;

  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="w-full max-w-2xl mx-auto mb-8 overflow-x-auto scrollbar-none">
      <div className="flex items-center justify-center gap-0 min-w-fit px-2">
        {steps.map((step, idx) => {
        const isCompleted = idx < currentIdx || (pendingStep && idx < steps.length - 1);
        const isCurrent = step.key === currentStep;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step circle + label */}
            <div 
              className={cn(
                "flex flex-col items-center gap-1.5 relative z-20",
                isCompleted && (!pendingStep || isRejected) && "cursor-pointer hover:opacity-80 transition-opacity"
              )}
              onClick={() => {
                if (isCompleted && (!pendingStep || isRejected)) {
                  router.push(`/onboarding/${step.key}`);
                }
              }}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all shrink-0",
                  isCompleted
                    ? "bg-primary border-primary text-white"
                    : isCurrent
                    ? pendingStep && step.key === "pending"
                      ? isRejected
                        ? "bg-red-500 border-red-500 text-white"
                        : "bg-amber-500 border-amber-500 text-white"
                      : "bg-primary border-primary text-white"
                    : "border-border bg-white text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap hidden sm:inline",
                  isCurrent
                    ? pendingStep && step.key === "pending"
                      ? isRejected ? "text-red-600" : "text-amber-600"
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
                  "h-[2px] w-8 sm:w-16 md:w-24 mx-1 mb-0 sm:mb-5 transition-all shrink-0",
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
