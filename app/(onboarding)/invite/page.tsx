import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ShieldCheck, ArrowRight, AlertCircle } from "lucide-react";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { validateInviteTokenPreview } from "@/lib/api/invite-preview";

interface InvitePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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

  const result = await validateInviteTokenPreview(token);

  if (!result.ok) {
    if (result.reason === "invalid") {
      // Pass the specific reason so /invite/expired can show the right copy:
      // consumed → "You've already set up your account, please log in"
      // expired  → "This invite link has expired, contact your organisation"
      const destination = result.consumed
        ? "/invite/expired?reason=consumed"
        : "/invite/expired";
      redirect(destination);
    }
    // Transient failure — stay on this URL and let the vendor retry
    // instead of telling them (possibly wrongly) that their invite expired.
    return <InviteLoadError token={token} />;
  }

  const invite = result.data;

  // Build the CTA href carrying all invite fields so the signup page
  // can populate the onboarding store without another API call.
  
  const isExistingVendor = invite.inviteeType === "existing_vendor" && invite.nextAction === "login_to_accept";

  const authToken = cookieStore.get(AUTH_COOKIE_NAMES.authToken)?.value;
  const isLoggedIn = !!authToken;
  const vendorStatus = cookieStore.get(AUTH_COOKIE_NAMES.vendorStatus)?.value;
  const isActive = (vendorStatus ?? "").toLowerCase() === "active";

  let ctaHref = "";
  let ctaText = "";

  if (isLoggedIn && isExistingVendor) {
    ctaHref = isActive ? `/companies/${invite.companyId}` : `/invitation/${invite.companyId}`;
    ctaText = "View Invitation";
  } else if (isExistingVendor) {
    ctaHref = `/auth/login` +
      `?email=${encodeURIComponent(invite.email)}` +
      `&company=${encodeURIComponent(invite.companyName)}` +
      `&companyId=${encodeURIComponent(invite.companyId)}`;
    ctaText = "Log in to Accept";
  } else {
    ctaHref = `/signup`;
    ctaText = "Start Vendor Setup";
  }

  // Show legalName as the primary identifier; fall back to displayName
  const businessLabel = invite.legalName || invite.displayName;

  const welcomeMessage = (isLoggedIn && isExistingVendor)
    ? `You have been invited by ${invite.companyName} to join their network.`
    : isExistingVendor
    ? `You have been invited by ${invite.companyName} to join their network. Log in with your existing credentials to accept.`
    : `You have been invited to register as a secure vendor. Complete our verification process to start receiving payments.`;

  return (
    <div className="relative z-10 flex flex-1 items-center justify-center w-full h-full overflow-hidden px-4 pb-16">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 flex flex-col items-center text-center">

          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to Villeto
          </h1>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs">
            {welcomeMessage}
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

          {/* CTA routes existing accounts to login and new accounts to signup. */}
          <Link
            href={ctaHref}
            className="w-full h-13 flex items-center justify-center gap-2 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
  );
}

function InviteLoadError({ token }: { token: string }) {
  return (
    <div className="relative z-10 flex flex-1 items-center justify-center w-full h-full overflow-hidden px-4 pb-16">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 flex flex-col items-center text-center">
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
      </div>
  );
}
