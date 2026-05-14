"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/Modal";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { submitOnboarding, getOnboardingReview } from "@/lib/api/onboarding";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ReviewPage() {
  const router = useRouter();
  const store = useOnboardingStore();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const uploadedDocs = store.documents.filter((d) => d.uploaded);

  useEffect(() => {
    getOnboardingReview()
      .catch((err) => console.error("Failed to fetch review data", err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await submitOnboarding();
      setShowSuccess(true);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    router.push("/pending");
  };

  return (
    <>
      <div className="w-full max-w-2xl flex flex-col h-full">
        <div className="shrink-0 pb-6">
          <OnboardingStepper currentStep="review" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border/50 flex-1 flex flex-col min-h-0 mb-4">
          <div className="shrink-0 p-8 pb-4 border-b border-border/30">
            <h2 className="text-2xl font-bold text-foreground mb-1">
              Review &amp; Submit
            </h2>
            <p className="text-sm text-muted-foreground">
              Please confirm your details are correct.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-8 pt-6 pr-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Summary card */}
          <div className="rounded-xl border border-border p-5 space-y-4 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Business Name</p>
                <p className="text-sm font-medium mt-0.5">
                  {store.businessIdentity.business_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registration Number</p>
                <p className="text-sm font-medium mt-0.5">
                  {store.businessIdentity.registration_number ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bank</p>
                <p className="text-sm font-medium mt-0.5">
                  {store.banking.bank_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="text-sm font-medium mt-0.5">
                  {store.banking.account_number ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Documents */}
          {uploadedDocs.length > 0 && (
            <div className="rounded-xl border border-border p-5 mb-5">
              <p className="text-sm font-semibold mb-3">Documents</p>
              <div className="space-y-2.5">
                {uploadedDocs.map((doc) => (
                  <div key={doc.type} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">{doc.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal consent */}
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors",
              confirmed
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
            onClick={() => setConfirmed((v) => !v)}
          >
            <CheckboxPrimitive.Root
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors mt-0.5",
                confirmed
                  ? "bg-primary border-primary"
                  : "bg-white border-border"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <CheckboxPrimitive.Indicator>
                <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </CheckboxPrimitive.Indicator>
            </CheckboxPrimitive.Root>
            <p className="text-sm text-muted-foreground leading-relaxed">
              I confirm that the information provided is accurate and legally
              valid. I understand that Villeto will verify these details before
              payments can be processed.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8"
              onClick={() => router.back()}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={!confirmed}
              loading={submitting}
              className="flex-1"
              onClick={handleSubmit}
            >
              Submit for Verification
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Button>
          </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Success modal */}
      <Dialog open={showSuccess} onOpenChange={(o) => !o && handleSuccessClose()}>
        <DialogContent size="sm" showClose>
          <div className="flex flex-col items-center text-center py-4">
            {/* Animated checkmark with confetti decorations */}
            <div className="relative mb-5">
              {/* Confetti dots */}
              {(
                [
                  { top: "10%", left: "5%", color: "bg-blue-500", size: "h-2 w-2" },
                  { top: "5%", right: "15%", color: "bg-orange-400", size: "h-1.5 w-1.5" },
                  { top: "25%", right: "0%", color: "bg-green-500", size: "h-2.5 w-2.5" },
                  { bottom: "15%", right: "5%", color: "bg-blue-400", size: "h-1.5 w-1.5" },
                  { bottom: "5%", left: "20%", color: "bg-primary", size: "h-2 w-2" },
                  { top: "40%", left: "0%", color: "bg-orange-500", size: "h-1.5 w-1.5" },
                ] as const
              ).map((dot, i) => (
                <div
                  key={i}
                  className={cn("absolute rounded-full", dot.color, dot.size)}
                  style={{
                    top: "top" in dot ? dot.top : undefined,
                    left: "left" in dot ? dot.left : undefined,
                    right: "right" in dot ? dot.right : undefined,
                    bottom: "bottom" in dot ? dot.bottom : undefined,
                  }}
                />
              ))}
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
            </div>

            <DialogTitle className="text-xl mb-2">Submitted Successfully</DialogTitle>
            <p className="text-sm text-muted-foreground mb-6">
              Your information has been sent for review and approval, you&apos;ll
              be notified of the result soon.
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
