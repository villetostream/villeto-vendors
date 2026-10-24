"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useMyCompany,
  useAcceptInvitation,
  useRejectInvitation,
  useVendorPaymentTerms,
  useCompanyPaymentTermOptions,
  useSaveCompanyPaymentTerm,
} from "@/lib/hooks/useVendorNetwork";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { useCompany } from "@/lib/hooks/useCompany";
import { PageSpinner } from "@/components/ui/Spinner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  CreditCard,
  Shield,
  FileCheck,
  Building2,
  LayoutDashboard,
  Layers,
  Edit3,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null) {
  const safe = (name ?? "").trim();
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return safe.substring(0, 2).toUpperCase();
}

function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-dashboard-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium text-foreground text-right capitalize", valueClass)}>
        {value}
      </span>
    </div>
  );
}

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const activeCompanyId = useCompanyStore((s) => s.activeCompanyId);
  const { switchCompany } = useCompany();

  const { data: company, isLoading, error } = useMyCompany(companyId);
  const acceptMutation = useAcceptInvitation();
  const rejectMutation = useRejectInvitation();
  const [isSwitching, setIsSwitching] = useState(false);

  // Payment terms queries & state
  const { data: termsData, isLoading: loadingTerms } = useVendorPaymentTerms({ companyId });
  const { data: termOptions = [], isLoading: loadingTermOptions } = useCompanyPaymentTermOptions(companyId);
  const saveTermsMutation = useSaveCompanyPaymentTerm();

  const currentTerm = termsData?.data?.find((t) => t.isCurrent) || termsData?.data?.[0];

  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDays, setCustomDays] = useState("30");
  const [customName, setCustomName] = useState("Custom Net 30");

  const openTermsModal = () => {
    if (currentTerm) {
      const match = termOptions.find((o) => o.days === currentTerm.days);
      if (match) {
        setSelectedOptionId(match.vendorPaymentTermOptionId);
        setIsCustomDays(false);
      } else {
        setIsCustomDays(true);
        setCustomDays(String(currentTerm.days));
        setCustomName(currentTerm.name);
      }
    } else if (termOptions.length > 0) {
      setSelectedOptionId(termOptions[0].vendorPaymentTermOptionId);
      setIsCustomDays(false);
    }
    setIsTermsModalOpen(true);
  };

  const handleSaveTerms = async () => {
    try {
      if (isCustomDays) {
        const daysNum = Math.max(0, parseInt(customDays, 10) || 0);
        const fallbackOpt = termOptions.find((o) => o.days === daysNum) || termOptions[0];
        if (!fallbackOpt) {
          toast.error("No valid payment term option available");
          return;
        }
        await saveTermsMutation.mutateAsync({
          companyId,
          payload: {
            optionId: fallbackOpt.vendorPaymentTermOptionId,
            name: customName.trim() || `Custom Net ${daysNum}`,
            days: daysNum,
          },
        });
      } else {
        const selectedOpt = termOptions.find((o) => o.vendorPaymentTermOptionId === selectedOptionId);
        if (!selectedOpt) {
          toast.error("Please select a payment term option");
          return;
        }
        await saveTermsMutation.mutateAsync({
          companyId,
          payload: {
            optionId: selectedOpt.vendorPaymentTermOptionId,
            name: selectedOpt.name,
            days: selectedOpt.days,
          },
        });
      }
      toast.success("Payment terms submitted successfully");
      setIsTermsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment terms");
    }
  };




  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync({ companyId });
      toast.success(`Accepted invitation from ${company?.companyName}`);
      if (company?.vendorId) {
        await switchCompany(company.vendorId, { preventRedirect: true });
        router.push(`/onboarding/${companyId}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to accept invitation");
    }
  };

  const handleReject = async () => {
    if (!confirm(`Are you sure you want to reject the invitation from ${company?.companyName}?`)) return;
    try {
      await rejectMutation.mutateAsync(companyId);
      toast.success("Invitation rejected");
      router.push("/companies");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject invitation");
    }
  };

  const handleSwitchToCompany = async () => {
    if (!company) return;
    setIsSwitching(true);
    try {
      await switchCompany(company.vendorId);
    } catch (err: any) {
      setIsSwitching(false);
      // toast is already handled inside switchCompany
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="bg-white rounded-2xl border border-dashboard-border p-8 text-center">
        <p className="text-red-600 mb-4">Failed to load organization details.</p>
        <Link href="/companies" className="text-primary hover:underline text-sm">
          ← Back to Organizations
        </Link>
      </div>
    );
  }

  const isActive = (company.status ?? "").trim().toLowerCase() === "active";
  const nextAction = company.nextAction;
  const isRejected =
    company.approvalStatus === "rejected" ||
    company.status === "rejected" ||
    company.onboardingStatus === "rejected" ||
    (nextAction as string) === "rejected";

  // Build status badge config
  const statusConfig = isActive
    ? { dot: "bg-emerald-500", label: "Active", labelClass: "text-emerald-600" }
    : isRejected
    ? { dot: "bg-rose-500", label: "Application Rejected", labelClass: "text-rose-600" }
    : nextAction === "accept_invitation"
    ? { dot: "bg-amber-500", label: "Invitation Pending", labelClass: "text-amber-600" }
    : nextAction === "complete_onboarding" || nextAction === "continue_onboarding"
    ? { dot: "bg-orange-500", label: "Action Required", labelClass: "text-orange-600" }
    : { dot: "bg-slate-400", label: company.status || "Unknown", labelClass: "text-slate-600" };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/companies"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Organizations
      </Link>

      {/* ── Header Card ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-6 py-6 border-b border-dashboard-border">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="h-14 w-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-lg font-semibold shrink-0">
              {getInitials(company.companyName)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{company.companyName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("h-2 w-2 rounded-full shrink-0", statusConfig.dot)} />
                <span className={cn("text-sm font-medium", statusConfig.labelClass)}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isRejected && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push(`/onboarding/${company.companyId}`)}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Modify & Resubmit
              </Button>
            )}
            {nextAction === "accept_invitation" && (
              <>
                <Button variant="primary" onClick={handleAccept} loading={acceptMutation.isPending} size="sm">
                  Accept Invitation
                </Button>
                <Button variant="outline" onClick={handleReject} loading={rejectMutation.isPending} size="sm">
                  Decline
                </Button>
              </>
            )}
            {(nextAction === "complete_onboarding" || nextAction === "continue_onboarding") && !isRejected && (
              <Button variant="primary" size="sm" onClick={() => router.push(`/onboarding/${company.companyId}`)}>
                Continue Onboarding
              </Button>
            )}
            {isActive && activeCompanyId !== company.companyId && (
              <Button variant="primary" size="sm" onClick={handleSwitchToCompany} loading={isSwitching}>
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Button>
            )}
            {isActive && activeCompanyId === company.companyId && (
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  View Dashboard
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* ── Action Banner ───────────────────────── */}
        {isRejected && (
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-900">
                  Onboarding Application Not Approved
                </p>
                <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                  {company.decisionNote ||
                    (company as any).rejectionReason ||
                    "The organization requested changes before your onboarding can be approved. You can review all steps, edit details, and resubmit."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/onboarding/${company.companyId}`)}
              className="shrink-0 text-xs border-rose-300 text-rose-800 hover:bg-rose-100"
            >
              Review & Edit Steps
            </Button>
          </div>
        )}
        {nextAction === "accept_invitation" && !isRejected && (
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">{company.companyName}</span> has invited you to connect. Accept the invitation to begin onboarding and get approved to do business with them.
            </p>
          </div>
        )}
        {nextAction === "complete_onboarding" && !isRejected && (
          <div className="px-6 py-4 bg-orange-50 border-b border-orange-100 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              <span className="font-medium">Onboarding incomplete.</span> You need to finish the onboarding steps before {company.companyName} can approve you.
            </p>
          </div>
        )}
        {nextAction === "submitted" && !isRejected && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex items-start gap-3">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800">
              Your profile has been submitted and is currently being reviewed by <span className="font-medium">{company.companyName}</span>. We'll notify you once a decision is made.
            </p>
          </div>
        )}

        {/* ── Details Grid ─────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-dashboard-border">
          {/* Left — Relationship Info */}
          <div className="px-6 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3">
              Relationship
            </p>
            <InfoRow
              label="Onboarding Status"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  {(company.onboardingStatus || "Pending").replace(/_/g, " ")}
                </span>
              }
            />
            <InfoRow
              label="Approval"
              value={
                <span className={cn(
                  "inline-flex items-center gap-1.5",
                  company.approvalStatus === "approved" ? "text-emerald-600" :
                  company.approvalStatus === "rejected" ? "text-rose-600" : ""
                )}>
                  {company.approvalStatus === "approved" ? (
                    <Shield className="h-3.5 w-3.5" />
                  ) : company.approvalStatus === "rejected" ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {company.approvalStatus || "Pending"}
                </span>
              }
            />
            <InfoRow
              label="Payment"
              value={
                <span className={cn("inline-flex items-center gap-1.5", company.isPaymentEnabled ? "text-emerald-600" : "text-muted-foreground")}>
                  <CreditCard className="h-3.5 w-3.5" />
                  {company.isPaymentEnabled ? "Enabled" : "Disabled"}
                </span>
              }
            />
          </div>

          {/* Right — Onboarding Setup */}
          <div className="px-6 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3">
              Setup
            </p>
            <InfoRow
              label="Onboarding Method"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  {(company.onboardingMethod || "—").replace(/_/g, " ")}
                </span>
              }
            />
            <InfoRow
              label="Uses Company Banking"
              value={company.usesCompanyBankingDetails ? "Yes" : "No"}
            />
            <InfoRow
              label="Verification Requested"
              value={company.verificationRequested ? "Yes" : "No"}
            />
          </div>
        </div>
      </div>

      {/* ── Business Details ─────────────────────────── */}
      {nextAction !== "accept_invitation" && company.businessDetails && (
        <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
          <div className="px-6 py-4 border-b border-dashboard-border bg-slate-50/50">
            <h2 className="text-lg font-semibold text-foreground">Business Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-dashboard-border">
            <div className="px-6 py-2">
              <InfoRow label="Legal Name" value={company.businessDetails.legalName || "—"} />
              <InfoRow label="Display Name" value={company.businessDetails.displayName || "—"} />
              <InfoRow label="Email" value={<span className="lowercase">{company.businessDetails.email || "—"}</span>} valueClass="normal-case" />
            </div>
            <div className="px-6 py-2">
              <InfoRow label="Country" value={company.businessDetails.country || "—"} />
              <InfoRow label="Registration Number" value={company.businessDetails.registrationNumber || "—"} />
              <InfoRow label="Business Address" value={company.businessDetails.businessAddress || "—"} />
            </div>
          </div>
        </div>
      )}

      {/* ── Banking Details ─────────────────────────── */}
      {nextAction !== "accept_invitation" && company.bankingDetails && (
        <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
          <div className="px-6 py-4 border-b border-dashboard-border bg-slate-50/50">
            <h2 className="text-lg font-semibold text-foreground">Banking Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-dashboard-border">
            <div className="px-6 py-2">
              <InfoRow label="Bank Name" value={company.bankingDetails.bankName || "—"} />
              <InfoRow label="Account Name" value={company.bankingDetails.accountName || "—"} />
            </div>
            <div className="px-6 py-2">
              <InfoRow label="Account Number" value={company.bankingDetails.maskedAccountNumber || "—"} />
              <InfoRow label="Status" value={company.bankingDetails.isComplete ? "Complete" : "Incomplete"} />
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Terms ─────────────────────────── */}
      {nextAction !== "accept_invitation" && (
        <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
          <div className="px-6 py-4 border-b border-dashboard-border bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Payment Terms</h2>
              {currentTerm && (
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-0.5 rounded-full capitalize border inline-flex items-center gap-1.5",
                    currentTerm.status === "approved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : currentTerm.status === "rejected"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : currentTerm.status === "superseded"
                      ? "bg-slate-100 text-slate-700 border-slate-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  )}
                >
                  {currentTerm.status === "approved" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : currentTerm.status === "rejected" ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {currentTerm.status.replace(/_/g, " ")}
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={
                currentTerm?.status === "rejected"
                  ? () => router.push(`/onboarding/${companyId}/payment-terms`)
                  : openTermsModal
              }
              className={cn(
                "text-xs h-8",
                currentTerm?.status === "rejected" &&
                  "border-rose-300 text-rose-700 hover:bg-rose-50"
              )}
            >
              {currentTerm?.status === "rejected" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Resubmit Payment Terms
                </>
              ) : (
                <>
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                  {currentTerm ? "Change Terms" : "Set Payment Terms"}
                </>
              )}
            </Button>
          </div>

          {currentTerm?.status === "rejected" && (
            <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-800">
                  {currentTerm.rejectionReason ? (
                    <>
                      <span className="font-semibold">Rejection reason: </span>
                      {currentTerm.rejectionReason}
                    </>
                  ) : (
                    <span className="font-semibold">
                      Your payment terms were rejected. Please modify and resubmit.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/onboarding/${companyId}/payment-terms`)}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline underline-offset-2 shrink-0 whitespace-nowrap"
              >
                Modify & Resubmit
              </button>
            </div>
          )}

          {currentTerm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-dashboard-border">
              <div className="px-6 py-2">
                <InfoRow label="Term Name" value={currentTerm.name} />
                <InfoRow
                  label="Due Window"
                  value={
                    currentTerm.days === 0
                      ? "Due on receipt (0 days)"
                      : `${currentTerm.days} days`
                  }
                />
                <InfoRow label="Code" value={currentTerm.code || "—"} valueClass="normal-case" />
              </div>
              <div className="px-6 py-2">
                <InfoRow label="Revision" value={`v${currentTerm.revision}`} />
                <InfoRow
                  label="Submitted"
                  value={
                    currentTerm.submittedAt
                      ? new Date(currentTerm.submittedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"
                  }
                />
                <InfoRow
                  label="Reviewed"
                  value={
                    currentTerm.reviewedAt
                      ? new Date(currentTerm.reviewedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Pending review"
                  }
                />
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No payment terms recorded for this organization yet.
              <div className="mt-3">
                <Button variant="primary" size="sm" onClick={openTermsModal}>
                  Configure Payment Terms
                </Button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Documents ─────────────────────────── */}
      {nextAction !== "accept_invitation" && company.documents && company.documents.length > 0 && (
        <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
          <div className="px-6 py-4 border-b border-dashboard-border bg-slate-50/50">
            <h2 className="text-lg font-semibold text-foreground">Documents</h2>
          </div>
          <div className="divide-y divide-dashboard-border">
            {company.documents.map((doc) => (
              <div key={doc.vendorDocumentId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <FileCheck className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {doc.documentType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">{doc.originalName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full capitalize",
                    doc.verificationStatus === "approved" ? "bg-emerald-100 text-emerald-700" :
                    doc.verificationStatus === "rejected" ? "bg-rose-100 text-rose-700" :
                    "bg-amber-100 text-amber-700"
                  )}>
                    {doc.verificationStatus || "Pending"}
                  </span>
                  {doc.fileUrl && (
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Update Payment Terms Modal ───────────── */}
      <Dialog open={isTermsModalOpen} onOpenChange={setIsTermsModalOpen}>
        <DialogContent size="md">
          <DialogTitle>Update Payment Terms</DialogTitle>
          <DialogDescription>
            Select your preferred payment terms from the options approved by {company.companyName}.
          </DialogDescription>

          <div className="space-y-4 pt-3 max-h-[60vh] overflow-y-auto pr-1">
            {loadingTermOptions ? (
              <div className="py-8 flex justify-center">
                <PageSpinner />
              </div>
            ) : (
              <div className="space-y-2.5">
                {termOptions
                  .filter((opt) => opt.isActive !== false)
                  .map((opt) => {
                    const isSelected =
                      !isCustomDays &&
                      selectedOptionId === opt.vendorPaymentTermOptionId;
                    return (
                      <div
                        key={opt.vendorPaymentTermOptionId}
                        onClick={() => {
                          setIsCustomDays(false);
                          setSelectedOptionId(opt.vendorPaymentTermOptionId);
                        }}
                        className={cn(
                          "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border/70 hover:border-slate-300 hover:bg-slate-50/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                              isSelected
                                ? "border-primary bg-white"
                                : "border-slate-300 bg-white"
                            )}
                          >
                            {isSelected && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {opt.name}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                                {opt.days === 0 ? "Due on receipt" : `${opt.days} days`}
                              </span>
                            </div>
                            {opt.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {opt.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* Propose custom option */}
                <div
                  onClick={() => setIsCustomDays(true)}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                    isCustomDays
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/70 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        isCustomDays
                          ? "border-primary bg-white"
                          : "border-slate-300 bg-white"
                      )}
                    >
                      {isCustomDays && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        Custom payment terms
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Propose custom days subject to company approval.
                      </p>
                    </div>
                  </div>
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                </div>

                {isCustomDays && (
                  <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 mt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Custom Term Name
                      </label>
                      <Input
                        placeholder="e.g. Custom Net 21"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Due Window (days)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        placeholder="e.g. 21"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTermsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={saveTermsMutation.isPending}
              onClick={handleSaveTerms}
            >
              {currentTerm?.status === "rejected" ? "Resubmit Payment Terms" : "Save Payment Terms"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

