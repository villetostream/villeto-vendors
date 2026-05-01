"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit2, CheckCircle2, Camera } from "lucide-react";
import { getVendorProfile } from "@/lib/api/vendor";
import { queryKeys } from "@/lib/stores/orgStore";
import { PageSpinner } from "@/components/ui/Spinner";
import { getInitials } from "@/lib/utils";
import Image from "next/image";

export default function ProfilePage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getVendorProfile,
    placeholderData: MOCK_PROFILE,
  });

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    // INTEGRATION POINT: upload avatar → PATCH /vendor/profile/avatar
  };

  if (isLoading) return <PageSpinner />;
  if (!profile) return null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        {/* Left column */}
        <div className="space-y-4">
          {/* Avatar + name row */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Avatar with camera overlay */}
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold overflow-hidden">
                    {avatarPreview ? (
                      <Image src={avatarPreview} alt="" width={64} height={64} className="h-full w-full object-cover" />
                    ) : profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt="" width={64} height={64} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(profile.business_name)
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="h-3 w-3 text-white" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
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
              <div className="text-right min-w-36">
                <p className="text-xs text-muted-foreground mb-1.5">Profile Completion</p>
                <div className="flex items-center gap-2 justify-end">
                  <div className="h-2 w-28 rounded-full bg-muted overflow-hidden">
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
            onEdit={() => {/* INTEGRATION POINT: open edit modal */ }}
          >
            <div className="grid grid-cols-2 gap-5">
              <ProfileField label="Registration Number / Tax ID" value={(profile as { registration_number?: string }).registration_number ?? "—"} />
              <ProfileField label="Country" value={(profile as { country?: string }).country ?? "—"} />
            </div>
            <ProfileField label="Business Address" value={(profile as { business_address?: string }).business_address ?? "—"} />
          </ProfileSection>

          {/* Banking Details */}
          <ProfileSection
            title="BANKING DETAILS"
            onEdit={() => {/* INTEGRATION POINT */ }}
          >
            <div className="grid grid-cols-2 gap-5">
              <ProfileField label="Bank Name" value={(profile as { bank_name?: string }).bank_name ?? "—"} />
              <ProfileField label="Account Number" value={(profile as { account_number?: string }).account_number ?? "—"} />
            </div>
          </ProfileSection>

          {/* Documents */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6">
            <p className="text-xs font-semibold text-muted-foreground tracking-widest mb-4">
              DOCUMENT
            </p>
            <div className="space-y-3">
              {((profile as { documents?: { type: string; label: string; file_name: string }[] }).documents ?? MOCK_PROFILE.documents).map((doc) => (
                <div
                  key={doc.type}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">{doc.label}</p>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                    Update
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Connected orgs */}
        <div className="bg-navy rounded-2xl p-5 text-navy-foreground">
          <p className="text-sm font-semibold mb-4">CONNECTED ORGANIZATIONS</p>
          <div className="space-y-3">
            {MOCK_ORGS.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between bg-white/5 rounded-xl p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold">{org.name}</p>
                  <p className="text-xs text-white/60 mt-0.5">
                    Vendor ID: {org.vendor_id}
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-primary text-white text-xs font-medium rounded-full">
                  Active
                </span>
              </div>
            ))}
          </div>
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
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5 text-primary" />
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

// ─── Mock data ────────────────────────────────

const MOCK_PROFILE = {
  id: "v1",
  email: "abcsupplies@gmail.com",
  business_name: "Business name",
  avatar_url: undefined,
  status: "active" as const,
  registration_number: "G442rD42",
  country: "Scotland",
  business_address: "4140 Parker Rd. Allentown, New Mexico 31134",
  bank_name: "Zenith bank",
  account_number: "1234456532",
  profile_completion: 100,
  documents: [
    { type: "certificate_of_incorporation", label: "Certificate of Incorporation", file_name: "CCA.jpeg", url: "" },
    { type: "tax_certificate", label: "Tax Certificate", file_name: "TIN.pdf", url: "" },
    { type: "government_id", label: "Government ID", file_name: "My ID.pdf", url: "" },
    { type: "bank_doc", label: "Bank Doc", file_name: "Statement of account.pdf", url: "" },
  ],
};

const MOCK_ORGS = [
  { id: "org1", name: "Global Logistics Corp", vendor_id: "V-99281-X" },
  { id: "org2", name: "TechFlow Systems", vendor_id: "V-99281-X" },
];
