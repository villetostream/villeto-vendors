"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, XCircle, CreditCard } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import { sendMessage } from "@/lib/api/vendor";
import { getVendorProfile } from "@/lib/api/vendor";
import { useAuthStore } from "@/lib/stores/authStore";
import { toast } from "sonner";
import { cn, isStatusActive } from "@/lib/utils";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

const POLL_INTERVAL_MS = 5_000;

const schema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
});

type FormData = z.infer<typeof schema>;

/**
 * Three distinct waiting states, not one binary "pending" — approval and
 * activation (payment-enablement) are separate backend gates, and a
 * vendor sitting in "approved, payment setup in progress" with no
 * indication of that is the most likely state to generate a confused
 * support ticket ("I was approved days ago, why can't I log in?").
 */
type PendingPhase = "under_review" | "payment_setup" | "rejected";

function getPhase(approvalStatus?: string, status?: string): PendingPhase {
  if (approvalStatus === "rejected") return "rejected";
  if (approvalStatus === "approved" && !isStatusActive(status)) return "payment_setup";
  return "under_review";
}

function PhaseAnimation({ phase }: { phase: PendingPhase }) {
  if (phase === "rejected") {
    return (
      <div className="relative h-14 w-14 rounded-full flex items-center justify-center shrink-0 bg-red-50" aria-hidden="true">
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-red-100">
          <XCircle className="h-5 w-5 text-red-500" />
        </div>
      </div>
    );
  }

  if (phase === "payment_setup") {
    return (
      <div className="relative h-14 w-14 rounded-full flex items-center justify-center shrink-0 bg-teal-50" aria-hidden="true">
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-teal-100">
          <CreditCard className="h-5 w-5 text-teal-600" />
        </div>
      </div>
    );
  }

  const color = "#f59e0b";
  return (
    <div className="relative h-14 w-14 rounded-full flex items-center justify-center shrink-0 bg-amber-50" aria-hidden="true">
      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-100">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
          <line
            x1="12" y1="12" x2="12" y2="7"
            stroke={color} strokeWidth="2" strokeLinecap="round"
            style={{ transformOrigin: "12px 12px", animation: "spin 12s linear infinite" }}
          />
          <line
            x1="12" y1="12" x2="16" y2="12"
            stroke={color} strokeWidth="1.5" strokeLinecap="round"
            style={{ transformOrigin: "12px 12px", animation: "spin 1s linear infinite" }}
          />
          <circle cx="12" cy="12" r="1.2" fill={color} />
          <line x1="12" y1="4" x2="12" y2="5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span
        className="absolute h-2.5 w-2.5 rounded-full bg-amber-400"
        style={{
          top: "50%", left: "50%",
          marginTop: "-1.25rem", marginLeft: "-0.3125rem",
          transformOrigin: "0.3125rem 1.25rem",
          animation: "spin 2s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const PHASE_COPY: Record<PendingPhase, { title: string; subtitle: string; badge: string; badgeClasses: string }> = {
  under_review: {
    title: "Pending Approval",
    subtitle: "Your credentials are under review.",
    badge: "Under Review",
    badgeClasses: "bg-amber-100 text-amber-700",
  },
  payment_setup: {
    title: "Setting Up Payments",
    subtitle: "You're approved — we're finishing payment setup.",
    badge: "Approved · Payment Setup",
    badgeClasses: "bg-teal-100 text-teal-700",
  },
  rejected: {
    title: "Application Rejected",
    subtitle: "Your application was not approved at this time.",
    badge: "Rejected",
    badgeClasses: "bg-red-100 text-red-700",
  },
};

export default function PendingPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const phase = getPhase(user?.approvalStatus, user?.status);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [sent, setSent] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const profile = await getVendorProfile();
        const current = userRef.current;

        const freshUser = {
          id: profile.vendorId,
          email: profile.email,
          business_name: profile.displayName || profile.legalName,
          status: profile.status,
          approvalStatus: profile.approvalStatus,
          onboardingStatus: profile.onboardingStatus,
          decisionNote: profile.decisionNote,
          isPaymentEnabled: profile.isPaymentEnabled,
        };

        const meaningfullyChanged =
          freshUser.approvalStatus !== current?.approvalStatus ||
          freshUser.status !== current?.status ||
          freshUser.decisionNote !== current?.decisionNote;

        if (meaningfullyChanged) {
          setUser(freshUser);
        }

        if (freshUser.approvalStatus) {
          Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, freshUser.approvalStatus, AUTH_COOKIE_OPTIONS);
        }
        if (freshUser.status) {
          Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, freshUser.status, AUTH_COOKIE_OPTIONS);
        }

        // Active (payment-enabled) → stop polling, go to dashboard.
        if (isStatusActive(freshUser.status)) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          toast.success("You're all set! Redirecting to your dashboard…");
          router.push("/dashboard");
          return;
        }

        if (freshUser.approvalStatus === "rejected") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (current?.approvalStatus !== "rejected") {
            toast.error("Your application has been reviewed and was not approved.");
          }
        }
      } catch {
        // Silently ignore poll failures — don't disrupt the UI.
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [router, setUser]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await sendMessage(data.message);
      setSent(true);
      reset();
      toast.success("Message sent successfully");
    } catch {
      toast.error("Failed to send message. Please try again.");
    }
  };

  const copy = PHASE_COPY[phase];
  const isRejected = phase === "rejected";

  return (
    <div className="w-full max-w-2xl flex flex-col h-full">
      <div className="shrink-0 pb-6">
        <OnboardingStepper currentStep="pending" pendingStep isRejected={isRejected} />
      </div>

      <div
        className={cn(
          "bg-white rounded-2xl shadow-sm border flex-1 flex flex-col min-h-0 mb-4 overflow-hidden",
          isRejected ? "border-red-200" : "border-border/50"
        )}
      >
        <div
          className={cn(
            "shrink-0 px-8 py-5 border-b flex items-center justify-between gap-4",
            isRejected ? "border-red-100 bg-red-50/40" : "border-border/30"
          )}
        >
          <div className="flex items-center gap-4">
            <PhaseAnimation phase={phase} />
            <div>
              <h2 className={cn("text-2xl font-bold leading-tight", isRejected ? "text-red-700" : "text-foreground")}>
                {copy.title}
              </h2>
              <p className={cn("text-sm mt-0.5", isRejected ? "text-red-500" : "text-muted-foreground")}>
                {copy.subtitle}
              </p>
            </div>
          </div>

          <span className={cn("shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full", copy.badgeClasses)}>
            {copy.badge}
          </span>
        </div>

        <div className="flex-1 flex flex-col min-h-0 px-8 py-6 gap-5">
          <p className="text-sm text-muted-foreground leading-relaxed shrink-0">
            {phase === "rejected" && (
              <>
                Unfortunately your vendor application was <strong className="text-red-600">rejected</strong> by{" "}
                <strong className="text-foreground">Villeto</strong>. You may send a message below to request
                reconsideration or ask for more information about the decision.
              </>
            )}
            {phase === "payment_setup" && (
              <>
                Your documents have been <strong className="text-foreground">approved</strong>. We&apos;re now
                finishing payment setup — this usually only takes a short while. You&apos;ll be redirected
                automatically the moment it&apos;s ready.
              </>
            )}
            {phase === "under_review" && (
              <>
                Your credentials are pending approval from <strong className="text-foreground">Villeto</strong>.
                You will be redirected to your dashboard automatically once you&apos;re approved and active. You
                can send a message to the team while you wait.
              </>
            )}
          </p>

          {isRejected && user?.decisionNote && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shrink-0">
              <h3 className="text-sm font-semibold text-red-800 mb-1">Reason for Rejection</h3>
              <p className="text-sm text-red-700">{user.decisionNote}</p>
            </div>
          )}

          <div
            className={cn(
              "rounded-xl border p-5 flex flex-col flex-1 min-h-0",
              isRejected ? "border-red-200 bg-red-50/30" : "border-border/60"
            )}
          >
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 gap-3">
              <label className="text-sm font-medium text-foreground shrink-0">
                Send a message to Villeto
              </label>

              <textarea
                placeholder="Enter your message here…"
                className={cn(
                  "flex-1 min-h-0 w-full rounded-xl border bg-white px-4 py-3 text-sm text-foreground",
                  "placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2",
                  "transition-all",
                  isRejected
                    ? "border-red-200 focus:ring-red-300/40 focus:border-red-400"
                    : "border-border focus:ring-primary/30 focus:border-primary",
                  errors.message && "border-red-400"
                )}
                {...register("message")}
              />

              {errors.message && (
                <p className="text-xs text-red-500 shrink-0 -mt-1">{errors.message.message}</p>
              )}

              <p className="text-xs text-muted-foreground shrink-0">
                The Villeto team will receive your message immediately.
              </p>

              {sent && (
                <p className="text-sm text-green-600 font-medium shrink-0">✓ Message sent successfully</p>
              )}

              <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full shrink-0 gap-2">
                <Send className="h-4 w-4" aria-hidden="true" />
                Send Message
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
