"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMyCompany, useAcceptInvitation, useRejectInvitation } from "@/lib/hooks/useVendorNetwork";
import { useCompany } from "@/lib/hooks/useCompany";
import { PageSpinner } from "@/components/ui/Spinner";
import {
  AlertCircle,
  Clock,
  CreditCard,
  FileCheck,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
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

export default function InvitationPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const { switchCompany } = useCompany();

  const { data: company, isLoading, error } = useMyCompany(companyId);
  const acceptMutation = useAcceptInvitation();
  const rejectMutation = useRejectInvitation();

  useEffect(() => {
    if (company && company.nextAction !== "accept_invitation") {
      // If the vendor already accepted this invite (e.g. they clicked an old email link),
      // kick them out of this standalone acceptance page and back into the main app shell.
      router.replace(`/companies/${companyId}`);
    }
  }, [company, companyId, router]);

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
    if (!confirm(`Are you sure you want to decline the invitation from ${company?.companyName}?`)) return;
    try {
      await rejectMutation.mutateAsync(companyId);
      toast.success("Invitation rejected");
      router.push("/auth/login");
    } catch (err: any) {
      toast.error(err.message || "Failed to decline invitation");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center w-full min-h-[50vh]">
        <PageSpinner />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex flex-1 items-center justify-center w-full min-h-[50vh]">
        <div className="bg-white rounded-2xl border border-dashboard-border p-8 text-center max-w-md w-full">
          <p className="text-red-600 mb-4">Failed to load invitation details.</p>
          <Button variant="outline" onClick={() => router.push("/auth/login")}>
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  const nextAction = company.nextAction;

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center w-full px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        
        <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-6 py-6 border-b border-dashboard-border">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-lg font-semibold shrink-0">
                {getInitials(company.companyName)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{company.companyName}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="h-2 w-2 rounded-full shrink-0 bg-orange-500" />
                  <span className="text-sm font-medium text-orange-600">
                    Invitation Pending
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
            </div>
          </div>

          {nextAction === "accept_invitation" && (
            <div className="px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <p className="text-sm text-orange-800">
                <span className="font-medium">{company.companyName}</span> has invited you to connect. Accept the invitation to begin onboarding and get approved to do business with them.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-dashboard-border">
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
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Pending
                  </span>
                }
              />
              <InfoRow
                label="Payment"
                value={
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    Disabled
                  </span>
                }
              />
            </div>

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
      </div>
    </div>
  );
}
