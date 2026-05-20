"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { useLogin } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/authStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { ApprovalStatus, OnboardingStatus, VendorStatus } from "@/lib/types";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const { setUser } = useAuthStore();
  const { hydrateFromSession } = useOnboardingStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // ── Redirect if already authenticated ───────────────────────
  const { user, isAuthenticated, isLoading } = useAuthStore();
  
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || isNavigating) return;

    const nextPath = next || "/dashboard";
    if (user.approvalStatus === "approved" && user.onboardingStatus === "completed") {
      router.replace(nextPath);
    } else if (user.approvalStatus === "rejected" || ["completed", "submitted", "under_review", "pending_approval"].includes(user.onboardingStatus || "")) {
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
      const res = await loginMutation.mutateAsync(data);
      const vendorData = res.data.data;

      setUser({
        id: vendorData.vendorId,
        email: vendorData.email,
        business_name: vendorData.legalName || vendorData.displayName,
        status: vendorData.status as VendorStatus,
        approvalStatus: vendorData.approvalStatus as ApprovalStatus,
        onboardingStatus: vendorData.onboardingStatus as OnboardingStatus,
        decisionNote: vendorData.decisionNote,
      });

      // Hydrate onboarding store with vendor identity + any partial data from server
      hydrateFromSession({
        vendorId: vendorData.vendorId,
        email: vendorData.email,
        legalName: vendorData.legalName,
        displayName: vendorData.displayName,
        businessIdentity: vendorData.businessIdentity,
      });

      setIsNavigating(true);

      // Give a small delay to ensure cookie is set and state is updated before push
      setTimeout(() => {
        // ── Route by approval + onboarding status ──────────────────
        if (
          vendorData.approvalStatus === "approved" &&
          vendorData.onboardingStatus === "completed"
        ) {
          router.push(next);
          return;
        }

        const pendingStatuses = ["completed", "submitted", "under_review", "pending_approval"];
        if (
          vendorData.approvalStatus === "rejected" ||
          pendingStatuses.includes(vendorData.onboardingStatus || "")
        ) {
          router.push("/pending");
          return;
        }

        const stepMap: Record<string, string> = {
          business_identity: "business-identity",
          banking_details: "banking",
          documents: "documents",
          review: "review",
        };

        const currentStep = vendorData.currentStep || "business_identity";
        const routeStep = stepMap[currentStep] || "business-identity";

        router.push(`/onboarding/${routeStep}`);
      }, 100);
    } catch (err: unknown) {
      setIsNavigating(false);
      toast.error((err as { message?: string })?.message ?? "Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      {/* Corner grid decorators */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

      <header className="relative z-10 px-6 py-5">
        <VilletoLogo size="md" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8">
          <div className="flex justify-center mb-6">
            <VilletoLogo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-1">
            Sign in as a Vendor
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Set a password and continue your registration process
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              label="Email Address"
              required
              error={errors.email?.message}
            >
              <Input
                type="email"
                placeholder="Enter email address"
                error={!!errors.email}
                {...register("email")}
              />
            </FormField>

            <FormField
              label="Password"
              required
              error={errors.password?.message}
            >
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  error={!!errors.password}
                  {...register("password")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting || loginMutation.isPending || isNavigating}
              className="w-full mt-2"
            >
              Login
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
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
