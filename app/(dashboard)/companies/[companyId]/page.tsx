"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMyCompany, useAcceptInvitation, useRejectInvitation } from "@/lib/hooks/useVendorNetwork";
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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  const words = name.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
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

  const isActive = company.status.toLowerCase() === "active";
  const nextAction = company.nextAction;

  // Build status badge config
  const statusConfig = isActive
    ? { dot: "bg-emerald-500", label: "Active", labelClass: "text-emerald-600" }
    : nextAction === "accept_invitation"
    ? { dot: "bg-amber-500", label: "Invitation Pending", labelClass: "text-amber-600" }
    : nextAction === "complete_onboarding"
    ? { dot: "bg-orange-500", label: "Action Required", labelClass: "text-orange-600" }
    : { dot: "bg-slate-400", label: company.status, labelClass: "text-slate-600" };

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
            {nextAction === "complete_onboarding" && (
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
        {nextAction === "accept_invitation" && (
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">{company.companyName}</span> has invited you to connect. Accept the invitation to begin onboarding and get approved to do business with them.
            </p>
          </div>
        )}
        {nextAction === "complete_onboarding" && (
          <div className="px-6 py-4 bg-orange-50 border-b border-orange-100 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              <span className="font-medium">Onboarding incomplete.</span> You need to finish the onboarding steps before {company.companyName} can approve you.
            </p>
          </div>
        )}
        {nextAction === "submitted" && (
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
    </div>
  );
}
