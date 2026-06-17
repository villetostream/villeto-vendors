"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, XCircle } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import { sendMessage } from "@/lib/api/vendor";
import { useAuthStore } from "@/lib/stores/authStore";
import { getMe } from "@/lib/api/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

const POLL_INTERVAL_MS = 5_000; // 5 seconds

const schema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
});

type FormData = z.infer<typeof schema>;

/** Animated clock/timer SVG — three rotating arcs around a clock face */
function TimerAnimation({ rejected }: { rejected: boolean }) {
  const color = rejected ? "#ef4444" : "#f59e0b";
  const bg = rejected ? "bg-red-50" : "bg-amber-50";
  const ring = rejected ? "bg-red-100" : "bg-amber-100";

  return (
    <div className={cn("relative h-14 w-14 rounded-full flex items-center justify-center shrink-0", bg)} aria-hidden="true">
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", ring)}>
        {rejected ? (
          <XCircle className="h-5 w-5 text-red-500" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            {/* Clock face */}
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
            {/* Hour hand */}
            <line
              x1="12" y1="12" x2="12" y2="7"
              stroke={color} strokeWidth="2" strokeLinecap="round"
              style={{ transformOrigin: "12px 12px", animation: "spin 12s linear infinite" }}
            />
            {/* Minute hand */}
            <line
              x1="12" y1="12" x2="16" y2="12"
              stroke={color} strokeWidth="1.5" strokeLinecap="round"
              style={{ transformOrigin: "12px 12px", animation: "spin 1s linear infinite" }}
            />
            {/* Centre dot */}
            <circle cx="12" cy="12" r="1.2" fill={color} />
            {/* Top mark */}
            <line x1="12" y1="4" x2="12" y2="5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Orbiting dot — only for pending */}
      {!rejected && (
        <span
          className="absolute h-2.5 w-2.5 rounded-full bg-amber-400"
          style={{
            top: "50%", left: "50%",
            marginTop: "-1.25rem", marginLeft: "-0.3125rem",
            transformOrigin: "0.3125rem 1.25rem",
            animation: "spin 2s linear infinite",
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PendingPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const isRejected = user?.approvalStatus === "rejected";
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling is set up once (see effect below) but needs to compare against
  // the *latest* user on every tick, not whatever it was when the interval
  // was created — a ref (rather than the `user` value itself) avoids that
  // stale-closure trap without having to tear down/recreate the interval
  // every time the user object changes.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [sent, setSent] = useState(false);

  // ── Real-time approval status polling ──────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const freshUser = await getMe();
        const current = userRef.current;

        // Only push a new object into the store (and trigger downstream
        // re-renders for every component reading useAuthStore) when
        // something the UI actually cares about has changed.
        const meaningfullyChanged =
          freshUser.approvalStatus !== current?.approvalStatus ||
          freshUser.onboardingStatus !== current?.onboardingStatus ||
          freshUser.decisionNote !== current?.decisionNote;

        if (meaningfullyChanged) {
          setUser(freshUser);
        }

        // Keep cookie in sync for middleware
        const status = freshUser.approvalStatus;
        if (status) {
          Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, status, AUTH_COOKIE_OPTIONS);
        }

        // Auto-redirect when approved AND onboarding completed
        if (
          freshUser.approvalStatus === "approved" &&
          freshUser.onboardingStatus === "completed"
        ) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          toast.success("You've been approved! Redirecting to your dashboard…");
          router.push("/dashboard");
        }
      } catch {
        // Silently ignore poll failures — don't disrupt the UI
      }
    };

    // Fire once immediately, then every POLL_INTERVAL_MS
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

  return (
    <div className="w-full max-w-2xl flex flex-col h-full">
      {/* Stepper */}
      <div className="shrink-0 pb-6">
        <OnboardingStepper currentStep="pending" pendingStep isRejected={isRejected} />
      </div>

      <div
        className={cn(
          "bg-white rounded-2xl shadow-sm border flex-1 flex flex-col min-h-0 mb-4 overflow-hidden",
          isRejected ? "border-red-200" : "border-border/50"
        )}
      >
        {/* ── Header row: title + timer side by side ── */}
        <div
          className={cn(
            "shrink-0 px-8 py-5 border-b flex items-center justify-between gap-4",
            isRejected ? "border-red-100 bg-red-50/40" : "border-border/30"
          )}
        >
          <div className="flex items-center gap-4">
            <TimerAnimation rejected={isRejected} />
            <div>
              <h2
                className={cn(
                  "text-2xl font-bold leading-tight",
                  isRejected ? "text-red-700" : "text-foreground"
                )}
              >
                {isRejected ? "Application Rejected" : "Pending Approval"}
              </h2>
              <p className={cn("text-sm mt-0.5", isRejected ? "text-red-500" : "text-muted-foreground")}>
                {isRejected
                  ? "Your application was not approved at this time."
                  : "Your credentials are under review."}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full",
              isRejected
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            )}
          >
            {isRejected ? "Rejected" : "Under Review"}
          </span>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex flex-col min-h-0 px-8 py-6 gap-5">

          {/* Info blurb */}
          <p className="text-sm text-muted-foreground leading-relaxed shrink-0">
            {isRejected ? (
              <>
                Unfortunately your vendor application was{" "}
                <strong className="text-red-600">rejected</strong> by{" "}
                <strong className="text-foreground">Villeto</strong>. You may
                send a message below to request reconsideration or ask for
                more information about the decision.
              </>
            ) : (
              <>
                Your credentials are pending approval from{" "}
                <strong className="text-foreground">Villeto</strong>. You will
                be redirected to your dashboard immediately upon approval. You
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

          {/* Message card — grows to fill remaining space */}
          <div
            className={cn(
              "rounded-xl border p-5 flex flex-col flex-1 min-h-0",
              isRejected ? "border-red-200 bg-red-50/30" : "border-border/60"
            )}
          >
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col flex-1 min-h-0 gap-3"
            >
              <label className="text-sm font-medium text-foreground shrink-0">
                Send a message to Villeto
              </label>

              {/* Textarea fills remaining space */}
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
                <p className="text-xs text-red-500 shrink-0 -mt-1">
                  {errors.message.message}
                </p>
              )}

              <p className="text-xs text-muted-foreground shrink-0">
                The Villeto team will receive your message immediately.
              </p>

              {sent && (
                <p className="text-sm text-green-600 font-medium shrink-0">
                  ✓ Message sent successfully
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting}
                className="w-full shrink-0 gap-2"
              >
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
