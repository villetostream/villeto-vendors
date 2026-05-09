import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";

interface InvitePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Shape returned by POST /vendors/invitations/preview
 */
interface InvitePreviewData {
  vendorId: string;
  vendorInvitationId: string;
  email: string;
  displayName: string;
  legalName: string;
  onboardingStatus: string;
  expiresAt: string;
  isExpired: boolean;
  isConsumed: boolean;
}

/**
 * Validate the invite token by calling the backend preview endpoint.
 * POST https://api.villeto.com/vendors/invitations/preview
 * Body: { token: string }
 *
 * The backend returns:
 * {
 *   "message": "OK",
 *   "status": 201,
 *   "data": {
 *     "message": "Vendor invitation is valid",
 *     "data": { vendorId, vendorInvitationId, email, displayName, legalName, ... }
 *   }
 * }
 */
async function validateInviteToken(token: string): Promise<InvitePreviewData> {
  const res = await fetch("https://api.villeto.com/vendors/invitations/preview", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const json = await res.json();
  // Response shape: { data: { data: InvitePreviewData } }
  const data: InvitePreviewData = json?.data?.data;

  if (!data) throw new Error("Empty response from invitation API");
  if (data.isExpired) throw new Error("Invitation has expired");
  if (data.isConsumed) throw new Error("Invitation has already been used");

  return data;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();

  // Primary: ?token=xxx (normalised by middleware via redirect)
  // Fallback: cookie set by middleware on the redirect response
  const token =
    (resolvedSearchParams.token as string | undefined) ||
    cookieStore.get("villeto_invite_token")?.value;

  if (!token) {
    // No token means the vendor navigated here directly — send to login
    redirect("/auth/login");
  }

  let invite: InvitePreviewData;
  try {
    invite = await validateInviteToken(token);
  } catch {
    // Expired, consumed, or backend error → show expired page
    redirect("/invite/expired");
  }

  // Build the CTA href carrying all invite fields so the signup page
  // can populate the onboarding store without another API call.
  const ctaHref =
    `/signup` +
    `?token=${encodeURIComponent(token)}` +
    `&email=${encodeURIComponent(invite.email)}` +
    `&displayName=${encodeURIComponent(invite.displayName)}` +
    `&legalName=${encodeURIComponent(invite.legalName)}` +
    `&vendorId=${encodeURIComponent(invite.vendorId)}` +
    `&vendorInvitationId=${encodeURIComponent(invite.vendorInvitationId)}`;

  // Show legalName as the primary identifier; fall back to displayName
  const businessLabel = invite.legalName || invite.displayName;

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      {/* Corner grid decorators */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Card */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 flex flex-col items-center text-center">
          <VilletoLogo size="md" className="mb-6" />

          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to Villeto
          </h1>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs">
            You have been invited to register as a secure vendor. Complete our
            verification process to start receiving payments.
          </p>

          {/* Vendor info card */}
          <div className="w-full rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-4 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">
                {businessLabel}
              </p>
              <p className="text-xs text-muted-foreground">{invite.email}</p>
            </div>
          </div>

          {/* CTA — passes all invite data through to signup */}
          <Link
            href={ctaHref}
            className="w-full h-13 flex items-center justify-center gap-2 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Start Vendor Setup
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
}
