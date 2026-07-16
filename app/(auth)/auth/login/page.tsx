"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { useLogin } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/authStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { isStatusActive } from "@/lib/utils";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

const ONBOARDING_STEP_ROUTES: Record<string, string> = {
  business_identity: "business-identity",
  banking_details: "banking",
  documents: "documents",
  review: "review",
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const { hydrateFromSession } = useOnboardingStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Hard-navigate so the browser sends the freshly-set cookies (vendorStatus,
  // approvalStatus, authToken) in the HTTP request. router.push() is a
  // client-side transition — the request goes out before js-cookie has flushed
  // the new cookies, so the edge middleware reads stale values and can either
  // redirect back to /auth/login or hang on the spinner until a manual reload.
  const hardNavigate = (href: string) => {
    window.location.href = href;
  };

  // ── Redirect if already authenticated ───────────────────────
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || isNavigating) return;

    if (isStatusActive(user.status)) {
      router.replace(next);
    } else {
      // Not yet active — approved-but-payment-pending, under review, or
      // rejected all land on /pending, which branches on the reason.
      router.replace("/pending");
    }
  }, [user, isAuthenticated, isLoading, isNavigating, router, next]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const loginMutation = useLogin();

  const onSubmit = async (data: FormData) => {
    try {
      // useLogin's mutationFn already persists the token cookie and
      // populates authStore + companyStore from the response — no need
      // to duplicate that here.
      const res = await loginMutation.mutateAsync(data);
      const { currentVendor, onboardingMode } = res.data;

      hydrateFromSession({
        vendorId: currentVendor.vendorId,
        email: currentVendor.email,
        legalName: currentVendor.legalName,
        displayName: currentVendor.displayName,
        businessIdentity: currentVendor.businessIdentity,
      });

      setIsNavigating(true);

      if (isStatusActive(currentVendor.status)) {
        hardNavigate(next);
        return;
      }

      // "review_and_submit" = vendor already has a reusable profile from
      // another company and just needs to confirm/submit to this one —
      // not the full wizard. A dedicated review-and-submit screen is a
      // follow-up; for now this safely lands on /pending, which explains
      // their status rather than dropping them into the wrong flow.
      if (onboardingMode === "review_and_submit" || currentVendor.approvalStatus !== null) {
        hardNavigate("/pending");
        return;
      }

      const currentStep = currentVendor.currentStep || "business_identity";
      const routeStep = ONBOARDING_STEP_ROUTES[currentStep] || "business-identity";
      hardNavigate(`/onboarding/${routeStep}`);
    } catch (err: unknown) {
      setIsNavigating(false);
      toast.error((err as { message?: string })?.message ?? "Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

      <header className="relative z-10 px-6 py-5">
        <VilletoLogo size="md" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8">
          <h1 className="text-2xl font-bold text-foreground text-center mb-1">Sign in as a Vendor</h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Enter your credentials to access your vendor account
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FormField label="Email Address" required error={errors.email?.message}>
              <Input
                type="email"
                placeholder="Enter email address"
                error={!!errors.email}
                autoComplete="email"
                {...register("email")}
              />
            </FormField>

            <FormField label="Password" required error={errors.password?.message}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  error={!!errors.password}
                  autoComplete="current-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </FormField>

            <Button type="submit" variant="primary" size="lg" loading={isSubmitting || loginMutation.isPending || isNavigating} className="w-full mt-2">
              Login
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
