"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit2, CheckCircle2, Camera } from "lucide-react";
import { toast } from "sonner";
import { getVendorProfile, getVendorOrganizations } from "@/lib/api/vendor";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { ErrorState } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { getInitials, cn } from "@/lib/utils";
import Image from "next/image";

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

export default function ProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getVendorProfile,
  });

  const organizations = useOrgStore((s) => s.organizations);
  const setOrganizations = useOrgStore((s) => s.setOrganizations);

  // The org list is also fetched in TopBar; this just makes sure the
  // "Connected Organizations" panel has real data even if profile loads
  // first (e.g. direct navigation to /profile).
  const { data: orgsData } = useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: getVendorOrganizations,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (orgsData) setOrganizations(orgsData);
  }, [orgsData, setOrganizations]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE_MB = 5;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${MAX_SIZE_MB}MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    // INTEGRATION POINT: upload avatar → PATCH /vendor/profile/avatar
  };

  const handleEditSection = (section: string) => {
    // INTEGRATION POINT: open edit modal for this section once built.
    toast.info(`Editing ${section} is coming soon.`);
  };

  if (isLoading) return <ProfileSkeleton />;

  if (isError) {
    return (
      <ErrorState
        message="Couldn't load your profile. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!profile) {
    return (
      <ErrorState message="We couldn't find your profile. Please try again." onRetry={() => refetch()} />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        {/* Left column */}
        <div className="space-y-4">
          {/* Avatar + name row */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {/* Avatar with camera overlay */}
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold overflow-hidden">
                    {avatarPreview ? (
                      <Image src={avatarPreview} alt={`${profile.business_name} avatar preview`} width={64} height={64} className="h-full w-full object-cover" />
                    ) : profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt={`${profile.business_name} avatar`} width={64} height={64} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(profile.business_name)
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label="Change profile photo"
                    className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="h-3 w-3 text-white" aria-hidden="true" />
                  </button>
                  <label htmlFor="avatar-upload" className="sr-only">Upload profile photo</label>
                  <input
                    id="avatar-upload"
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{profile.business_name}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>

              {/* Profile completion */}
              <div className="sm:text-right sm:min-w-36">
                <p className="text-xs text-muted-foreground mb-1.5">Profile Completion</p>
                <div className="flex items-center gap-2 sm:justify-end">
                  <div
                    className="h-2 w-28 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={profile.profile_completion}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Profile completion"
                  >
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${profile.profile_completion}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">{profile.profile_completion}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Business Identity */}
          <ProfileSection
            title="BUSINESS IDENTITY"
            onEdit={() => handleEditSection("business identity")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ProfileField label="Registration Number / Tax ID" value={profile.registration_number || "—"} />
              <ProfileField label="Country" value={profile.country || "—"} />
            </div>
            <ProfileField label="Business Address" value={profile.business_address || "—"} />
          </ProfileSection>

          {/* Banking Details */}
          <ProfileSection
            title="BANKING DETAILS"
            onEdit={() => handleEditSection("banking details")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ProfileField label="Bank Name" value={profile.bank_name || "—"} />
              <ProfileField label="Account Number" value={profile.account_number || "—"} />
            </div>
          </ProfileSection>

          {/* Documents */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <p className="text-xs font-semibold text-muted-foreground tracking-widest mb-4">
              DOCUMENT
            </p>
            {profile.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents on file yet.</p>
            ) : (
              <div className="space-y-3">
                {profile.documents.map((doc) => (
                  <div
                    key={doc.type}
                    className="flex items-center justify-between py-2 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{doc.label}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEditSection(doc.label)}
                      className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors shrink-0"
                    >
                      Update
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Connected orgs */}
        <div className="bg-navy rounded-2xl p-5 text-navy-foreground">
          <p className="text-sm font-semibold mb-4">CONNECTED ORGANIZATIONS</p>
          {organizations.length === 0 ? (
            <p className="text-sm text-white/60">No organizations connected yet.</p>
          ) : (
            <div className="space-y-3">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl p-3.5 gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{org.name}</p>
                    <p className="text-xs text-white/60 mt-0.5 truncate">
                      Vendor ID: {org.vendor_id}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-full shrink-0 capitalize",
                      org.status === "active"
                        ? "bg-primary text-white"
                        : "bg-white/10 text-white/80"
                    )}
                  >
                    {org.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────

function ProfileSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashboard-border p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-muted-foreground tracking-widest">
          {title}
        </p>
        <button
          onClick={onEdit}
          aria-label={`Edit ${title.toLowerCase()}`}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
