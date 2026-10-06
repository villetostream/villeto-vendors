"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useSubmitV2Onboarding } from "@/lib/hooks/useVendorNetwork";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, CheckCircle, Store, CreditCard, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";

export default function V2ReviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  const submitMutation = useSubmitV2Onboarding();
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const identity = store.businessIdentity;

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(companyId);
      toast.success("Profile submitted successfully!");
      // Mark as submitted locally so guards route to /pending (not back into
      // the wizard) until the next profile refresh brings the real status.
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
            Please review your information before submitting to the company.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <div className="space-y-6">
            
            <ReviewSection title="Business Identity" icon={Store} onEdit={() => router.push(`/onboarding/${companyId}/business-identity`)}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Business Name</p>
                  <p className="font-medium text-sm">{identity.businessName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Registration No.</p>
                  <p className="font-medium text-sm">{identity.registrationNumber || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Country</p>
                  <p className="font-medium text-sm">{identity.country || "Not provided"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Address</p>
                  <p className="font-medium text-sm">{identity.businessAddress || "Not provided"}</p>
                </div>
              </div>
            </ReviewSection>

            <ReviewSection title="Banking Details" icon={CreditCard} onEdit={() => router.push(`/onboarding/${companyId}/banking`)}>
              {store.bankingDetails ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                    <p className="font-medium text-sm">{store.bankingDetails.bankName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                    <p className="font-medium text-sm">{store.bankingDetails.accountNumber}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Account Name</p>
                    <p className="font-medium text-sm">{store.bankingDetails.accountName}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <p className="text-sm font-medium">Banking details not provided</p>
                </div>
              )}
            </ReviewSection>

            {store.onboardingStatus?.documentsRequired && (
              <ReviewSection title="Documents" icon={FileText} onEdit={() => router.push(`/onboarding/${companyId}/documents`)}>
                {store.uploadedDocuments && store.uploadedDocuments.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {store.uploadedDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between border-b border-border/30 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                        </div>
                        {doc.url && (
                          <a 
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                            title="View Document"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <p className="text-sm font-medium">No documents uploaded</p>
                  </div>
                )}
              </ReviewSection>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mt-8">
              <p className="text-sm text-blue-800 font-medium">
                By submitting, you confirm that all provided information is accurate and you agree to the company's vendor terms.
              </p>
            </div>

            <div className="flex gap-3 pt-6 border-t border-border/50 mt-8">
              <Button type="button" variant="outline" size="lg" className="px-8" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button type="button" variant="primary" size="lg" className="flex-1" onClick={handleSubmit} loading={submitMutation.isPending}>
                Submit Application
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, icon: Icon, children, onEdit }: any) {
  return (
    <div className="border border-border/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <button onClick={onEdit} className="text-sm text-primary font-medium hover:underline">
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}
