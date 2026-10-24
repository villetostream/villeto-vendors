"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, XCircle, CreditCard } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import { sendMessage, getVendorProfile, getVendorCompanies } from "@/lib/api/vendor";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { useMyCompany, useVendorPaymentTerms } from "@/lib/hooks/useVendorNetwork";
import { useQueryClient } from "@tanstack/react-query";
import { PageSpinner } from "@/components/ui/Spinner";
import { toast } from "sonner";
import { cn, isStatusActive, hasSubmittedOnboarding } from "@/lib/utils";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS } from "@/lib/constants/auth";

const POLL_INTERVAL_MS = 3_000;

const schema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
});

type FormData = z.infer<typeof schema>;

/**
 * Four distinct waiting/review states:
 * - under_review: Credentials submitted, awaiting company review.
 * - payment_setup: Application approved by company, payment setup in progress.
 * - rejected: Entire vendor application rejected by company.
 * - payment_terms_rejected: Application approved, but payment terms rejected by company.
 */
type PendingPhase = "under_review" | "payment_setup" | "rejected" | "payment_terms_rejected";

function getPhase(
  approvalStatus?: string | null,
  status?: string,
  onboardingStatus?: string | null,
  nextAction?: string | null,
  paymentTermStatus?: string | null
): PendingPhase {
  const normApproval = (approvalStatus ?? "").toLowerCase().trim();
  const normStatus = (status ?? "").toLowerCase().trim();
  const normOnboarding = (onboardingStatus ?? "").toLowerCase().trim();
  const normNextAction = (nextAction ?? "").toLowerCase().trim();
  const normPaymentTerm = (paymentTermStatus ?? "").toLowerCase().trim();

  // 1. If approved or active
  if (normApproval === "approved" || isStatusActive(status)) {
    if (normPaymentTerm === "rejected") {
      return "payment_terms_rejected";
    }
    return "payment_setup";
  }

  // 2. Awaiting company review (new submission or resubmission)
  const isAwaitingReview =
    normOnboarding === "submitted" ||
    normNextAction === "awaiting_company_review" ||
    normApproval === "pending" ||
    normApproval === "under_review";

  // If previous approval was rejected, but vendor has resubmitted (awaiting review):
  if (normApproval === "rejected" && isAwaitingReview) {
    return "under_review";
  }

  // 3. Rejected application (and not currently awaiting review of a resubmission)
  if (normApproval === "rejected" || normStatus === "rejected") {
    return "rejected";
  }

  if (isAwaitingReview) {
    return "under_review";
  }

  return "under_review";
}

function PhaseAnimation({ phase }: { phase: PendingPhase }) {
  if (phase === "rejected" || phase === "payment_terms_rejected") {
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
  payment_terms_rejected: {
    title: "Payment Terms Rejected",
    subtitle: "Changes were requested for your payment terms.",
    badge: "Terms Rejected",
    badgeClasses: "bg-red-100 text-red-700",
  },
};

export default function PendingPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user, setUser, isLoading } = useAuthStore();
  const storeCompanyId = useCompanyStore((s) => s.activeCompanyId);
  const cookieCompanyId = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId) : undefined;
  const activeCompanyId = storeCompanyId || user?.companyId || cookieCompanyId;

  // Poll company status every 3 seconds so company approvals/rejections reflect live without manual reload
  const { data: company, isLoading: loadingCompany } = useMyCompany(activeCompanyId || "", {
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Poll payment terms every 3 seconds so payment approvals/rejections reflect live without manual reload
  const { data: paymentTermsData } = useVendorPaymentTerms(
    activeCompanyId ? { companyId: activeCompanyId } : {},
    undefined,
    {
      refetchInterval: POLL_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      enabled: !!activeCompanyId,
    }
  );

  const currentPaymentTerm = useMemo(() => {
    const list = paymentTermsData?.data || [];
    return list.find((t) => t.isCurrent) || list[0] || null;
  }, [paymentTermsData]);

  const companyName = company?.companyName || user?.companyName;
  const targetRecipient = companyName || "the company";
  const cookieDecisionNote = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.decisionNote) : undefined;

  const cookieApproval = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.approvalStatus) : undefined;
  const cookieStatus = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.vendorStatus) : undefined;
  const effectiveApproval = company?.approvalStatus ?? user?.approvalStatus ?? cookieApproval;
  const effectiveStatus = company?.status ?? user?.status ?? cookieStatus;
  const effectiveOnboarding = company?.onboardingStatus ?? user?.onboardingStatus;
  const effectiveNextAction = (company as any)?.nextAction ?? (user as any)?.nextAction;
  const effectivePaymentTermStatus = currentPaymentTerm?.status;

  const phase = getPhase(
    effectiveApproval,
    effectiveStatus,
    effectiveOnboarding,
    effectiveNextAction,
    effectivePaymentTermStatus
  );

  const isRejected = phase === "rejected";
  const isPaymentTermsRejected = phase === "payment_terms_rejected";
  const isPaymentSetup = phase === "payment_setup";
  const copy = PHASE_COPY[phase];

  const decisionNote = isRejected
    ? (company?.decisionNote || (company as any)?.rejectionReason || user?.decisionNote || cookieDecisionNote)
    : isPaymentTermsRejected
    ? (currentPaymentTerm?.rejectionReason || "Please review and update your payment terms.")
    : null;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const prevPhaseRef = useRef<PendingPhase | null>(null);

  // Live reaction whenever company or payment terms data updates
  useEffect(() => {
    if (!company) return;

    const effApproval = company.approvalStatus;
    const effStatus = company.status;
    const effOnboarding = company.onboardingStatus;
    const effNextAction = (company as any).nextAction;
    const effPaymentTermStatus = currentPaymentTerm?.status;
    const note = (company as any).decisionNote || (company as any).rejectionReason;
    const currentPhase = getPhase(effApproval, effStatus, effOnboarding, effNextAction, effPaymentTermStatus);

    // Keep header switcher in sync
    queryClient.invalidateQueries({ queryKey: queryKeys.companies() });

    // Sync to auth store
    if (userRef.current) {
      setUser({
        ...userRef.current,
        approvalStatus: effApproval as any,
        status: effStatus,
        onboardingStatus: effOnboarding as any,
        decisionNote: currentPhase === "rejected" ? note : null,
        isPaymentEnabled: company.isPaymentEnabled ?? userRef.current.isPaymentEnabled,
        companyName: company.companyName || userRef.current.companyName,
      });
    }

    // Sync cookies
    if (effApproval) {
      Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, currentPhase === "under_review" ? "pending" : effApproval, AUTH_COOKIE_OPTIONS);
    }
    if (effStatus) {
      Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, effStatus, AUTH_COOKIE_OPTIONS);
    }
    if (currentPhase === "rejected" && note) {
      Cookies.set(AUTH_COOKIE_NAMES.decisionNote, note, AUTH_COOKIE_OPTIONS);
    } else {
      Cookies.remove(AUTH_COOKIE_NAMES.decisionNote);
    }

    // Notifications on transitions
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== currentPhase) {
      if (currentPhase === "payment_setup" && prevPhaseRef.current === "under_review") {
        toast.success("Application approved! Setting up payments…");
      } else if (currentPhase === "rejected") {
        toast.error("Your application has been reviewed and was not approved.");
      } else if (currentPhase === "payment_terms_rejected") {
        toast.error("Your payment terms were not approved. Please update them to proceed.");
      }
    }
    prevPhaseRef.current = currentPhase;

    // Active (payment-enabled) → go to dashboard!
    if (isStatusActive(effStatus) || company.isPaymentEnabled) {
      toast.success("Payment approved! Redirecting to your dashboard…");
      router.replace("/dashboard");
    }
  }, [company, currentPaymentTerm, router, setUser, queryClient]);

  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await sendMessage(data.message, activeCompanyId);
      setSent(true);
      reset();
      toast.success("Message sent successfully");
    } catch {
      toast.error("Failed to send message. Please try again.");
    }
  };

  // Guard: a vendor who hasn't submitted onboarding for this company (e.g.
  // just accepted an invitation) must not see "Pending Approval" — send them
  // into the V2 onboarding wizard instead.
  // Rejection check: a rejected vendor must NEVER be bounced away from /pending.
  useEffect(() => {
    if (!user) return;
    if (isRejected || isPaymentTermsRejected) return;
    if (isStatusActive(user.status)) return;
    if (hasSubmittedOnboarding(user)) return;
    const companyId = user.companyId || Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId);
    if (companyId) router.replace(`/onboarding/${companyId}`);
  }, [user, router, isRejected, isPaymentTermsRejected]);

  // Real-time polling and window focus / visibility sync
  useEffect(() => {
    // If the application is already active, redirect and exit.
    if (isStatusActive(effectiveStatus) || company?.isPaymentEnabled) {
      toast.success("Payment approved! Redirecting to your dashboard…");
      router.replace("/dashboard");
      return;
    }

    const triggerRefresh = () => {
      if (activeCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(activeCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.v2PaymentTerms({ companyId: activeCompanyId }) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    };

    const handleFocusOrVisible = () => {
      triggerRefresh();
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    const poll = async () => {
      try {
        const [profile, companies] = await Promise.all([
          getVendorProfile(),
          getVendorCompanies(),
        ]);
        const current = userRef.current;
        const activeId = activeCompanyId || current?.companyId || Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId);
        const match = companies.find((c) => c.companyId === activeId) || companies[0];

        triggerRefresh();

        const freshUser = {
          id: profile.vendorId,
          email: profile.email,
          business_name: profile.displayName || profile.legalName,
          status: match?.status || profile.status,
          approvalStatus: (match?.approvalStatus || profile.approvalStatus) as any,
          onboardingStatus: (match?.onboardingStatus || profile.onboardingStatus) as any,
          decisionNote:
            (match as any)?.decisionNote ||
            (match as any)?.rejectionReason ||
            profile.decisionNote,
          isPaymentEnabled: match?.isPaymentEnabled ?? profile.isPaymentEnabled,
          companyId: match?.companyId,
          companyName: match?.companyName,
        };

        const meaningfullyChanged =
          freshUser.approvalStatus !== current?.approvalStatus ||
          freshUser.onboardingStatus !== current?.onboardingStatus ||
          freshUser.status !== current?.status ||
          freshUser.isPaymentEnabled !== current?.isPaymentEnabled ||
          freshUser.decisionNote !== current?.decisionNote;

        if (meaningfullyChanged) {
          setUser({ ...current, ...freshUser });
        }

        if (freshUser.approvalStatus) {
          Cookies.set(AUTH_COOKIE_NAMES.approvalStatus, freshUser.approvalStatus, AUTH_COOKIE_OPTIONS);
        }
        if (freshUser.status) {
          Cookies.set(AUTH_COOKIE_NAMES.vendorStatus, freshUser.status, AUTH_COOKIE_OPTIONS);
        }
        if (freshUser.decisionNote) {
          Cookies.set(AUTH_COOKIE_NAMES.decisionNote, freshUser.decisionNote, AUTH_COOKIE_OPTIONS);
        }

        // Active (payment-enabled) → stop polling, go to dashboard.
        if (isStatusActive(freshUser.status) || freshUser.isPaymentEnabled) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          toast.success("Payment approved! Redirecting to your dashboard…");
          router.replace("/dashboard");
          return;
        }
      } catch {
        // Silently ignore poll failures — don't disrupt the UI.
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [router, setUser, effectiveStatus, activeCompanyId, company?.isPaymentEnabled, queryClient]);

  if (isLoading || (loadingCompany && !company)) {
    return (
      <div className="w-full max-w-2xl flex flex-col h-full items-center justify-center py-20">
        <PageSpinner />
      </div>
    );
  }

  const hasAuthToken = typeof window !== "undefined" ? !!Cookies.get(AUTH_COOKIE_NAMES.authToken) : true;
  if (!user && !hasAuthToken) {
    return null;
  }

  return (
    <div className="w-full flex flex-col h-full min-h-0 items-center">
      {/* Stepper container - wide enough to fit all steps without scrolling */}
      <div className="w-full max-w-4xl shrink-0 px-4 pb-6">
        <OnboardingStepper
          currentStep="pending"
          pendingStep
          isRejected={isRejected}
          isPaymentSetup={isPaymentSetup}
          isPaymentTermsRejected={isPaymentTermsRejected}
          companyId={activeCompanyId}
        />
      </div>

      {/* Card container - matches the exact max-w-2xl width of the Review & Resubmit step */}
      <div className="w-full max-w-2xl flex-1 flex flex-col min-h-0 px-4 mb-4">
        <div
          className={cn(
            "bg-white rounded-2xl shadow-sm border flex-1 flex flex-col min-h-0 overflow-hidden",
            isRejected || isPaymentTermsRejected ? "border-red-200" : "border-border/50"
          )}
        >
          <div
            className={cn(
              "shrink-0 px-8 py-5 border-b flex items-center justify-between gap-4",
              isRejected || isPaymentTermsRejected ? "border-red-100 bg-red-50/40" : "border-border/30"
            )}
          >
            <div className="flex items-center gap-4">
              <PhaseAnimation phase={phase} />
              <div>
                <h2
                  className={cn(
                    "text-2xl font-bold leading-tight",
                    isRejected || isPaymentTermsRejected ? "text-red-700" : "text-foreground"
                  )}
                >
                  {copy.title}
                </h2>
                <p
                  className={cn(
                    "text-sm mt-0.5",
                    isRejected || isPaymentTermsRejected ? "text-red-500" : "text-muted-foreground"
                  )}
                >
                  {copy.subtitle}
                </p>
              </div>
            </div>

            <span className={cn("shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full", copy.badgeClasses)}>
              {copy.badge}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-5">
            {isPaymentTermsRejected ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-red-900 mb-1">
                    Payment Terms Not Approved
                  </h3>
                  <p className="text-xs text-red-700 leading-relaxed min-h-[1.25rem]">
                    {decisionNote ? (
                      `Feedback: ${decisionNote}`
                    ) : (
                      "Your credentials were approved, but the company requested changes to your payment terms before payments can be processed."
                    )}
                  </p>
                </div>
                {activeCompanyId && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => router.push(`/onboarding/${activeCompanyId}/payment-terms`)}
                    className="shrink-0 bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    Update Payment Terms
                  </Button>
                )}
              </div>
            ) : isRejected ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-red-900 mb-1">
                    Application Not Approved
                  </h3>
                  <p className="text-xs text-red-700 leading-relaxed min-h-[1.25rem]">
                    {decisionNote ? (
                      `Feedback: ${decisionNote}`
                    ) : loadingCompany ? (
                      <span className="inline-block h-3.5 w-48 bg-red-200/60 rounded animate-pulse" />
                    ) : (
                      "The organization requested changes before your application can be approved. You can review all steps, modify details, and resubmit."
                    )}
                  </p>
                </div>
                {activeCompanyId && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => router.push(`/onboarding/${activeCompanyId}/review`)}
                    className="shrink-0 bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    Modify & Resubmit
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed shrink-0">
                {phase === "payment_setup" && (
                  <>
                    Your documents have been <strong className="text-foreground">approved</strong>. We&apos;re now
                    finishing payment setup — this usually only takes a short while. You&apos;ll be redirected
                    automatically the moment it&apos;s ready.
                  </>
                )}
                {phase === "under_review" && (
                  <>
                    Your credentials are pending approval from <strong className="text-foreground">{targetRecipient}</strong>.
                    You will be redirected to your dashboard automatically once you&apos;re approved and active. You
                    can send a message to the team while you wait.
                  </>
                )}
              </p>
            )}

            <div
              className={cn(
                "rounded-xl border p-5 flex flex-col shrink-0",
                isRejected || isPaymentTermsRejected ? "border-red-200 bg-red-50/30" : "border-border/60"
              )}
            >
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-foreground">
                  Send a message to {targetRecipient}
                </label>

                <textarea
                  placeholder="Enter your message here…"
                  rows={4}
                  className={cn(
                    "w-full min-h-[110px] rounded-xl border bg-white px-4 py-3 text-sm text-foreground",
                    "placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2",
                    "transition-all",
                    isRejected || isPaymentTermsRejected
                      ? "border-red-200 focus:ring-red-300/40 focus:border-red-400"
                      : "border-border focus:ring-primary/30 focus:border-primary",
                    errors.message && "border-red-400"
                  )}
                  {...register("message")}
                />

                {errors.message && (
                  <p className="text-xs text-red-500 -mt-1">{errors.message.message}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  The {companyName ? `${companyName} team` : "company team"} will receive your message immediately.
                </p>

                {sent && (
                  <p className="text-sm text-green-600 font-medium">✓ Message sent successfully</p>
                )}

                <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full gap-2">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Send Message
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
