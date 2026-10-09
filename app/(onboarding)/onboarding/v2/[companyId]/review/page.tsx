"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useSubmitV2Onboarding } from "@/lib/hooks/useVendorNetwork";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";

const DOC_LABELS: Record<string, string> = {
  "certificate_of_incorporation": "Certificate of Incorporation",
  "tax_certificate": "Tax Certificate",
  "government_id": "Government ID",
  "bank_document": "Bank Document",
};

export default function V2ReviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  const submitMutation = useSubmitV2Onboarding();
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [mounted, setMounted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const identity = store.businessIdentity;

  const handleSubmit = async () => {
    if (!confirmed) return;
    try {
      await submitMutation.mutateAsync(companyId);
      toast.success("Profile submitted successfully!");
      if (authUser) {
        setUser({
          ...authUser,
          approvalStatus: authUser.approvalStatus ?? "pending",
          onboardingStatus: "submitted",
        });
      }
      router.push("/pending");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit profile");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">Review & Submit</h2>
          <p className="text-sm text-muted-foreground">
            Please confirm your details are correct.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <div className="space-y-5">
            
            <div className="border border-border/60 rounded-xl p-6">
              <div className="grid grid-cols-2 gap-y-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Business Name</p>
                  <p className="font-medium text-foreground">{identity.businessName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Registration Number</p>
                  <p className="font-medium text-foreground">{identity.registrationNumber || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bank</p>
                  <p className="font-medium text-foreground">{store.bankingDetails?.bankName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account</p>
                  <p className="font-medium text-foreground">{store.bankingDetails?.accountNumber || "Not provided"}</p>
                </div>
              </div>
            </div>

            {store.onboardingStatus?.documentsRequired && store.uploadedDocuments && store.uploadedDocuments.length > 0 && (
              <div className="border border-border/60 rounded-xl p-6">
                <h4 className="text-muted-foreground font-medium mb-4">Documents</h4>
                <div className="h-px w-full bg-border/40 mb-4" />
                <div className="flex flex-col gap-4">
                  {store.uploadedDocuments.map((doc) => {
                    const label = DOC_LABELS[doc.id] || "Document";
                    return (
                      <div key={doc.id} className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div 
              className={cn(
                "p-4 rounded-xl border flex gap-3 cursor-pointer transition-colors mt-8 select-none",
                confirmed ? "bg-[#e6f7f5] border-primary" : "bg-slate-50 border-border/60 hover:bg-slate-100"
              )} 
              onClick={() => setConfirmed(!confirmed)}
            >
              <div className="pt-0.5 shrink-0">
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                  confirmed ? "bg-primary border-primary" : "border-border/80 bg-white"
                )}>
                  {confirmed && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                </div>
              </div>
              <p className="text-sm text-foreground">
                I confirm that the information provided is accurate and legally valid. I understand that Villeto will verify these details before payments can be processed.
              </p>
            </div>

            <div className="flex gap-3 pt-6 mt-8">
              <Button type="button" variant="outline" size="lg" className="px-8" onClick={() => router.back()}>
                Back
              </Button>
              <Button 
                type="button" 
                variant="primary" 
                size="lg" 
                className="flex-1" 
                onClick={handleSubmit} 
                loading={submitMutation.isPending} 
                disabled={!confirmed}
              >
                Submit for Verification <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
