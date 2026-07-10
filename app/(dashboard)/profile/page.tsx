"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Lock, X, Check } from "lucide-react";
import { toast } from "sonner";
import { getVendorProfile, getVendorCompanies, updateVendorProfile } from "@/lib/api/vendor";
import { queryKeys, useCompanyStore } from "@/lib/stores/companyStore";
import { ErrorState } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { VendorStatusBadge } from "@/components/ui/StatusBadge";
import { getInitials, cn } from "@/lib/utils";
import { UpdateVendorProfilePayload } from "@/lib/types";

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-24" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-dashboard-border p-6 flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * TENANT-EDITABLE fields (Tier 2 — our internal proposal, not yet a
 * confirmed backend contract). These are the only ones the PATCH
 * endpoint accepts. Identity fields (legalName, registration number,
 * certificates) are NOT editable here — see the locked section below and
 * PROFILE_FIELD_TIERS notes in lib/api/vendor.ts.
 */
const EDITABLE_FIELDS: { key: keyof UpdateVendorProfilePayload; label: string; placeholder?: string }[] = [
  { key: "displayName", label: "Display Name" },
  { key: "contactFirstName", label: "Contact First Name" },
  { key: "contactLastName", label: "Contact Last Name" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "address", label: "Business Address" },
  { key: "description", label: "Description", placeholder: "Optional — a short line about your business" },
];

export default function ProfilePage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";
  const queryClient = useQueryClient();

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.profile(companyId),
    queryFn: getVendorProfile,
    enabled: !!companyId,
  });

  const companies = useCompanyStore((s) => s.companies);
  const setCompanies = useCompanyStore((s) => s.setCompanies);

  // Companies list is also fetched by CompanySwitcher; this just ensures
  // the "Companies you work with" panel has data even on a direct
  // navigation to /profile.
  const { data: companiesData } = useQuery({
    queryKey: queryKeys.companies(),
    queryFn: getVendorCompanies,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (companiesData) setCompanies(companiesData);
  }, [companiesData, setCompanies]);

  const [editingField, setEditingField] = useState<keyof UpdateVendorProfilePayload | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateVendorProfilePayload) => updateVendorProfile(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.profile(companyId), data);
      toast.success("Profile updated");
      setEditingField(null);
    },
    onError: () => toast.error("Couldn't update your profile. Please try again."),
  });

  const startEdit = (field: keyof UpdateVendorProfilePayload, currentValue: string) => {
    setEditingField(field);
    setDraftValue(currentValue);
  };

  const saveEdit = (field: keyof UpdateVendorProfilePayload) => {
    if (!draftValue.trim() && field !== "description") {
      toast.error("This field can't be empty.");
      return;
    }
    updateMutation.mutate({ [field]: draftValue.trim() });
  };

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile) {
    return <ErrorState message="Couldn't load your profile. Please try again." onRetry={() => refetch()} />;
  }

  const fieldValues: Record<string, string> = {
    displayName: profile.displayName ?? "",
    contactFirstName: profile.contactFirstName ?? "",
    contactLastName: profile.contactLastName ?? "",
    phone: profile.phone ?? "",
    country: profile.country ?? "",
    address: profile.address ?? "",
    description: profile.description ?? "",
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="space-y-4">
          {/* Identity header */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
                  {getInitials(profile.displayName || profile.legalName)}
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{profile.displayName || profile.legalName}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>
              <VendorStatusBadge status={profile.status} approvalStatus={profile.approvalStatus} />
            </div>
            {profile.decisionNote && (
              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                <strong className="text-foreground">Note from review: </strong>
                {profile.decisionNote}
              </p>
            )}
          </div>

          {/* Locked identity fields — Tier 1, shared across every company
              this vendor works with. Editing these isn't offered here by
              design; see the "request correction" note below. */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs font-semibold text-muted-foreground tracking-widest">VERIFIED IDENTITY</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-muted-foreground">Legal Name</p>
                <p className="text-sm font-semibold mt-0.5 text-muted-foreground">{profile.legalName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-semibold mt-0.5 text-muted-foreground">{profile.email}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              These were verified when you first onboarded and apply across every company you work with. To
              change them, contact support to request a correction.
            </p>
          </div>

          {/* Tenant-editable fields — Tier 2 */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <p className="text-xs font-semibold text-muted-foreground tracking-widest mb-4">CONTACT & BUSINESS DETAILS</p>
            <div className="space-y-4">
              {EDITABLE_FIELDS.map(({ key, label, placeholder }) => {
                const isEditing = editingField === key;
                const currentValue = fieldValues[key];

                return (
                  <div key={key} className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            autoFocus
                            type="text"
                            value={draftValue}
                            placeholder={placeholder}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(key);
                              if (e.key === "Escape") setEditingField(null);
                            }}
                            className="w-full text-sm border border-primary rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            onClick={() => saveEdit(key)}
                            disabled={updateMutation.isPending}
                            aria-label={`Save ${label}`}
                            className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shrink-0"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => setEditingField(null)}
                            aria-label="Cancel"
                            className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold mt-0.5 truncate">{currentValue || "—"}</p>
                      )}
                    </div>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(key, currentValue)}
                        aria-label={`Edit ${label}`}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              These details apply only to your relationship with the company you&apos;re currently working with —
              switching company context may show different values here.
            </p>
          </div>
        </div>

        {/* Right: companies this vendor works with */}
        <div className="bg-navy rounded-2xl p-5 text-navy-foreground">
          <p className="text-sm font-semibold mb-4">COMPANIES YOU WORK WITH</p>
          {companies.length === 0 ? (
            <p className="text-sm text-white/60">No companies connected yet.</p>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <div key={company.vendorId} className="flex items-center justify-between bg-white/5 rounded-xl p-3.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{company.companyName}</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      {company.isPaymentEnabled ? "Payment enabled" : "Payment not yet enabled"}
                    </p>
                  </div>
                  <VendorStatusBadge
                    status={company.status}
                    approvalStatus={company.approvalStatus}
                    className={cn(company.companyId === companyId && "ring-1 ring-white/40")}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
