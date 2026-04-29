"use client";

import { Check } from "lucide-react";
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
}

export function OnboardingStepper({
  currentStep,
  pendingStep = false,
}: OnboardingStepperProps) {
  const steps = pendingStep
    ? [
        ...STEPS.map((s) => ({ ...s, completed: true })),
        { key: "pending", label: "Under Review", completed: false },
      ]
    : STEPS;

  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto mb-8">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIdx || (pendingStep && idx < steps.length - 1);
        const isCurrent = step.key === currentStep;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all",
                  isCompleted
                    ? "bg-primary border-primary text-white"
                    : isCurrent
                    ? pendingStep && step.key === "pending"
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-primary border-primary text-white"
                    : "border-border bg-white text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? pendingStep && step.key === "pending"
                      ? "text-amber-600"
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
                  "h-[2px] w-16 sm:w-24 mx-1 mb-5 transition-all",
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
  );
}
