"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompanyOnboardingStore } from "@/lib/stores/companyOnboardingStore";
import { useSubmitV2Onboarding, useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Check, ArrowRight, Edit3, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

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
  const store = useCompanyOnboardingStore();
  const submitMutation = useSubmitV2Onboarding();
  const { data: company } = useMyCompany(companyId);
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [mounted, setMounted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const identity = store.businessIdentity;

  const cookieApproval = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.approvalStatus) : undefined;
  const isApproved =
    company?.approvalStatus === "approved" ||
    authUser?.approvalStatus === "approved" ||
    cookieApproval === "approved" ||
    (company?.status ?? "").toLowerCase() === "active";

  const isAwaitingReview =
    (company?.onboardingStatus ?? "").toLowerCase() === "submitted" ||
    (company as any)?.nextAction === "awaiting_company_review" ||
    (authUser?.onboardingStatus ?? "").toLowerCase() === "submitted";

  const isRejected =
    !isApproved &&
    !isAwaitingReview &&
    (company?.approvalStatus === "rejected" ||
      company?.status === "rejected" ||
      (company as any)?.onboardingStatus === "rejected" ||
      authUser?.approvalStatus === "rejected");

  const handleSubmit = async () => {
    if (!confirmed) return;
    try {
      await submitMutation.mutateAsync(companyId);
      toast.success(isRejected ? "Profile resubmitted successfully!" : "Profile submitted successfully!");
      if (authUser) {
        setUser({
          ...authUser,
          approvalStatus: "pending",
          onboardingStatus: "submitted",
          decisionNote: null,
        });
      }
      Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, "pending", AUTH_COOKIE_OPTIONS);
      Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
      router.push("/pending");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit profile");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            {isApproved ? "Application Review" : isRejected ? "Review & Resubmit" : "Review & Submit"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isApproved
              ? "Your application has been approved and is currently undergoing payment setup."
              : isRejected
              ? "Review your details, edit any sections to match organization feedback, and resubmit."
              : "Please confirm your details are correct."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-6">
          <div className="space-y-5">
            {/* Rejection Notice Banner */}
            {isRejected && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-900">Application Needs Modification</h3>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                    {company?.decisionNote ||
                      (company as any)?.rejectionReason ||
                      authUser?.decisionNote ||
                      "The organization requested modifications before your application can be approved. You can edit any section below and resubmit."}
                  </p>
                </div>
              </div>
            )}

            {/* Business Details Card */}
            <div className="border border-border/60 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-muted-foreground font-medium">Business Details</h4>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => router.push(`/onboarding/${companyId}/business-identity`)}
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>
              <div className="h-px w-full bg-border/40 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Business Name</p>
                  <p className="font-medium text-foreground">{identity.businessName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Registration Number</p>
                  <p className="font-medium text-foreground">{identity.registrationNumber || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="font-medium text-foreground">{identity.email || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Country</p>
                  <p className="font-medium text-foreground">{identity.country || "Not provided"}</p>
                </div>
                {identity.businessAddress && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Business Address</p>
                    <p className="font-medium text-foreground">{identity.businessAddress}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Banking Details Card */}
            <div className="border border-border/60 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-muted-foreground font-medium">Banking Details</h4>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => router.push(`/onboarding/${companyId}/banking`)}
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>
              <div className="h-px w-full bg-border/40 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bank</p>
                  <p className="font-medium text-foreground">{store.bankingDetails?.bankName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                  <p className="font-medium text-foreground">{store.bankingDetails?.accountNumber || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account Name</p>
                  <p className="font-medium text-foreground">{store.bankingDetails?.accountName || "Not provided"}</p>
                </div>
              </div>
            </div>

            {/* Payment Terms card */}
            <div className="border border-border/60 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-muted-foreground font-medium">Payment Terms</h4>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => router.push(`/onboarding/${companyId}/payment-terms`)}
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>
              <div className="h-px w-full bg-border/40 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Preferred Terms</p>
                  <p className="font-medium text-foreground">
                    {store.paymentTerms?.arrangement ||
                      store.paymentTerms?.name ||
                      "Not provided"}
                  </p>
                </div>
                {store.paymentTerms?.isDynamic ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Payment Period</p>
                    <p className="font-medium text-teal-700">
                      Dynamic (Specified per invoice)
                    </p>
                  </div>
                ) : store.paymentTerms?.days !== undefined ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Payment Period</p>
                    <p className="font-medium text-foreground">
                      {store.paymentTerms.days === 0
                        ? "Due on receipt (0 days)"
                        : `${store.paymentTerms.days} days`}
                    </p>
                  </div>
                ) : store.paymentTerms?.period ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Payment Period</p>
                    <p className="font-medium text-foreground">
                      {store.paymentTerms.period === "Other" && store.paymentTerms.customPeriod
                        ? store.paymentTerms.customPeriod
                        : store.paymentTerms.period}
                    </p>
                  </div>
                ) : null}
                {store.paymentTerms?.advancePercentage !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Advance Payment</p>
                    <p className="font-medium text-foreground">
                      {store.paymentTerms.advancePercentage}%
                    </p>
                  </div>
                )}
                {store.paymentTerms?.notes && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Additional Terms or Notes</p>
                    <p className="font-medium text-foreground whitespace-pre-wrap">
                      {store.paymentTerms.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Documents Card */}
            {store.onboardingStatus?.documentsRequired && store.uploadedDocuments && store.uploadedDocuments.length > 0 && (
              <div className="border border-border/60 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-muted-foreground font-medium">Documents</h4>
                  {!isApproved && (
                    <button
                      type="button"
                      onClick={() => router.push(`/onboarding/${companyId}/documents`)}
                      className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                </div>
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

            {/* Confirmation Checkbox */}
            {!isApproved && (
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
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 mt-8">
              <Button type="button" variant="outline" size="lg" className="px-6" onClick={() => router.back()}>
                Back
              </Button>
              {isApproved ? (
                <Button 
                  type="button" 
                  variant="primary" 
                  size="lg" 
                  className="flex-1" 
                  onClick={() => router.push("/pending")}
                >
                  Return to Overview
                </Button>
              ) : (
                <Button 
                  type="button" 
                  variant="primary" 
                  size="lg" 
                  className="flex-1" 
                  onClick={handleSubmit} 
                  loading={submitMutation.isPending} 
                  disabled={!confirmed}
                >
                  {isRejected ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Resubmit Application
                    </>
                  ) : (
                    <>
                      Submit for Verification <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
