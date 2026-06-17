import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ShieldCheck, ArrowRight, AlertCircle } from "lucide-react";
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

type InviteResult =
  | { ok: true; data: InvitePreviewData }
  // "invalid": backend has definitively confirmed the invite doesn't exist,
  // is expired, or is already consumed → safe to send to /invite/expired
  // with its "request a new invite" messaging.
  | { ok: false; reason: "invalid" }
  // "transient": the request itself failed (network error, timeout, 5xx,
  // unparseable response) → we don't actually know the invite's real
  // status, so it would be wrong to tell the vendor it's expired.
  | { ok: false; reason: "transient" };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.villeto.com";

/**
 * Validate the invite token by calling the backend preview endpoint.
 * POST {API_BASE_URL}/vendors/invitations/preview
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
async function validateInviteToken(token: string): Promise<InviteResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/vendors/invitations/preview`, {
      method: "POST",
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    // Network failure — couldn't even reach the backend.
    return { ok: false, reason: "transient" };
  }

  if (!res.ok) {
    // 404/410 are reasonable signals the invite genuinely doesn't exist /
    // is gone; anything else (5xx, rate limiting, etc.) is transient.
    return { ok: false, reason: res.status === 404 || res.status === 410 ? "invalid" : "transient" };
  }

  let json: { data?: { data?: InvitePreviewData } };
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: "transient" };
  }

  const data = json?.data?.data;
  if (!data) return { ok: false, reason: "transient" };
  if (data.isExpired || data.isConsumed) return { ok: false, reason: "invalid" };

  return { ok: true, data };
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

  const result = await validateInviteToken(token);

  if (!result.ok) {
    if (result.reason === "invalid") {
      redirect("/invite/expired");
    }
    // Transient failure — stay on this URL and let the vendor retry
    // instead of telling them (possibly wrongly) that their invite expired.
    return <InviteLoadError token={token} />;
  }

  const invite = result.data;

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
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
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
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function InviteLoadError({ token }: { token: string }) {
  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 flex flex-col items-center text-center">
          <VilletoLogo size="md" className="mb-6" />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 mb-4">
            <AlertCircle className="h-6 w-6 text-amber-500" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            Couldn&apos;t load your invitation
          </h1>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs">
            We had trouble reaching our servers just now. Your invitation
            link itself looks fine — please try again in a moment.
          </p>
          <Link
            href={`/invite?token=${encodeURIComponent(token)}`}
            className="w-full h-13 flex items-center justify-center gap-2 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Try again
          </Link>
        </div>
      </main>
    </div>
  );
}
