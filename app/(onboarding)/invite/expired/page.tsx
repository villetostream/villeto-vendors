import Link from "next/link";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Clock } from "lucide-react";

export default function InviteExpiredPage() {
  return (
    <div className="h-screen onboarding-bg flex flex-col justify-center relative overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      />

     

      <main className="relative z-10 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 mb-5">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            Invitation Link Expired
          </h1>
          <p className="text-sm text-muted-foreground mb-8 max-w-xs">
            This invite link is no longer valid. Invite links expire after 7 days. Please contact your organisation to request a new invitation.
          </p>
          <Link
            href="/auth/login"
            className="text-sm text-primary hover:underline"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
