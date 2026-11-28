"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";

export function LandingWorkspaceLink({ variant }: { variant: "header" | "primary" }) {
  const { user, isAuthenticated } = useAuthStore();
  const signedIn = isAuthenticated && !!user;
  // The login proxy routes an existing session to its current company workspace.
  const href = "/auth/login";

  return (
    <Link
      href={href}
      className={variant === "header"
        ? "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/25 px-4 text-xs font-semibold text-white transition hover:border-[#66d9cf] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81e3d9] sm:px-5 sm:text-sm"
        : "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#57d3c8] px-6 text-sm font-bold text-[#10353f] shadow-[0_10px_25px_rgba(26,193,181,0.18)] transition hover:bg-[#7be1d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81e3d9]"
      }
    >
      {signedIn ? "Open workspace" : "Sign in"}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
