"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMyCompanies } from "@/lib/hooks/useVendorNetwork";
import { PageSpinner } from "@/components/ui/Spinner";
import {
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  ExternalLink,
  Shield,
  CreditCard,
  FileCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Spinner";
import { V2CompanyRelationship } from "@/lib/types";

/* ── Helpers ────────────────────────────────── */

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  active:           { label: "Active",            dot: "bg-emerald-500" },
  pending_approval: { label: "Pending Approval",  dot: "bg-amber-500" },
  rejected:         { label: "Rejected",           dot: "bg-rose-500" },
  inactive:         { label: "Inactive",           dot: "bg-slate-400" },
  archive:          { label: "Archived",           dot: "bg-slate-400" },
};

function getStatusDot(status: string, nextAction?: string | null) {
  if (nextAction === "accept_invitation") {
    return { label: "Invitation Pending", dot: "bg-amber-500" };
  }
  if (nextAction === "complete_onboarding") {
    return { label: "Action Required", dot: "bg-orange-500" };
  }
  return STATUS_MAP[status.toLowerCase()] ?? { label: status, dot: "bg-slate-400" };
}

function getInitials(name: string) {
  const words = name.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}


/* ── Stat summary helpers ───────────────────── */

function computeStats(companies: V2CompanyRelationship[]) {
  return {
    total: companies.length,
    active: companies.filter((c) => c.status.toLowerCase() === "active").length,
    pendingApproval: companies.filter(
      (c) =>
        c.status.toLowerCase() === "pending_approval" ||
        c.nextAction === "complete_onboarding" ||
        c.nextAction === "accept_invitation"
    ).length,
    paymentsEnabled: companies.filter((c) => c.isPaymentEnabled).length,
  };
}

/* ── Component ──────────────────────────────── */

export default function CompaniesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Always fetch all companies — filter client-side so tab clicks
  // don't trigger a new network request and cause a full reload.
  const { data, isLoading, error } = useMyCompanies({});

  const companies = data?.data || [];
  const stats = computeStats(companies);

  // Client-side filtering — no extra network requests
  const filteredCompanies = companies.filter((c) => {
    const matchesFilter =
      filter === "all" ? true
      : filter === "Active" ? c.status.toLowerCase() === "active"
      : filter === "pending_approval"
        ? c.status.toLowerCase() === "pending_approval" ||
          c.nextAction === "complete_onboarding" ||
          c.nextAction === "accept_invitation"
        : true;

    const matchesSearch = c.companyName
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-dashboard-border p-8 text-center text-red-600">
        Failed to load organizations. Please try again.
      </div>
    );
  }

  const FILTERS = [
    { key: "all",              label: "All",     count: stats.total },
    { key: "Active",          label: "Active",  count: stats.active },
    { key: "pending_approval",label: "Pending", count: stats.pendingApproval },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Companies you're connected to as a vendor partner.
        </p>
      </div>

      {/* ── Summary Cards ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-dashboard-border p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-muted-foreground font-medium">Total</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
              <Building2 className="h-[18px] w-[18px]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>

        <div className="bg-white rounded-2xl border border-dashboard-border p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-muted-foreground font-medium">Active</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-[18px] w-[18px]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.active}</p>
        </div>

        <div className="bg-white rounded-2xl border border-dashboard-border p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-muted-foreground font-medium">Pending</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-[18px] w-[18px]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.pendingApproval}</p>
        </div>

        <div className="bg-white rounded-2xl border border-dashboard-border p-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-muted-foreground font-medium">Payments Enabled</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-[18px] w-[18px]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.paymentsEnabled}</p>
        </div>
      </div>

      {/* ── Table Container ────────────────────── */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-dashboard-border">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center",
                  filter === f.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {f.label}
                {f.key === "pending_approval" && f.count > 0 ? (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 h-5 min-w-[20px] px-1 text-[10px] font-bold text-white tabular-nums">
                    {f.count}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "ml-1.5 text-xs tabular-nums",
                      filter === f.key ? "text-primary/70" : "text-muted-foreground/60"
                    )}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-transparent border-dashboard-border"
            />
          </div>
        </div>

        {/* Table */}
        {filteredCompanies.length === 0 ? (
          <EmptyState
            title="No organizations found"
            description={
              search
                ? `No results for "${search}".`
                : "You haven't been connected to any organizations yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Organization</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Onboarding</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Approval</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Payments</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => {
                  const { label: statusLabel, dot } = getStatusDot(company.status, company.nextAction);
                  const onboardingLabel = (company.onboardingStatus || "pending").replace(/_/g, " ");
                  const approvalLabel = company.approvalStatus || "pending";

                  return (
                    <tr
                      key={company.companyId}
                      onClick={() => router.push(`/companies/${company.companyId}`)}
                      className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors cursor-pointer group"
                    >
                      {/* Organization */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-semibold shrink-0">
                            {getInitials(company.companyName)}
                          </div>
                          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate max-w-[200px]">
                            {company.companyName}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
                          <span className="text-foreground font-medium">{statusLabel}</span>
                        </span>
                      </td>

                      {/* Onboarding */}
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
                          <FileCheck className="h-3.5 w-3.5 shrink-0" />
                          {onboardingLabel}
                        </span>
                      </td>

                      {/* Approval */}
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-sm capitalize",
                            approvalLabel === "approved"
                              ? "text-emerald-600"
                              : approvalLabel === "rejected"
                              ? "text-rose-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {approvalLabel === "approved" ? (
                            <Shield className="h-3.5 w-3.5" />
                          ) : approvalLabel === "rejected" ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <Clock className="h-3.5 w-3.5" />
                          )}
                          {approvalLabel}
                        </span>
                      </td>

                      {/* Payments */}
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-sm",
                            company.isPaymentEnabled
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                          )}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          {company.isPaymentEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => router.push(`/companies/${company.companyId}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
