import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";

interface InvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * SERVER COMPONENT
 *
 * This page is reached after the middleware has already done the
 * edge-level token format check. Here we do the full server-side
 * validation against the backend to get vendor details.
 *
 * INTEGRATION POINT:
 * Replace the mock below with a real server-side fetch:
 *
 *   const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/invite/validate`, {
 *     method: "POST",
 *     body: JSON.stringify({ token }),
 *     headers: { "Content-Type": "application/json" },
 *     cache: "no-store",
 *   });
 *   if (!res.ok) redirect("/invite/expired");
 *   const { data } = await res.json();
 *   if (data.already_onboarded) redirect("/auth/login");
 */
async function validateToken(_token: string) {
  // MOCK — replace with real API call
  return {
    business_name: "ABC Supplies Ltd",
    email: "abcsupplies@gmail.com",
    invited_by_org: "XYZ Company",
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { token } = await searchParams;

  if (!token) redirect("/auth/login");

  let vendorInfo;
  try {
    vendorInfo = await validateToken(token);
  } catch {
    redirect("/invite/expired");
  }

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      {/* Corner grid decorators */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
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
                {vendorInfo.business_name}
              </p>
              <p className="text-xs text-muted-foreground">{vendorInfo.email}</p>
            </div>
          </div>

          {/* CTA — passes token through to signup */}
          <Link
            href={`/signup?token=${token}`}
            className="w-full h-13 flex items-center justify-center gap-2 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Start Vendor Setup
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
}
