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
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { signUp, getMe } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Minimum 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[a-z]/, "Must contain lowercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

const RULES = [
  { key: "length", label: "8+ characters", test: (p: string) => p.length >= 8 },
  { key: "number", label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { key: "upper", label: "Uppercase Letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "Lowercase Letter", test: (p: string) => /[a-z]/.test(p) },
];

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The invite page passes token as a standard ?token=xxx param in the CTA link
  const token = searchParams.get("token") ?? "";
  const emailParam = searchParams.get("email") ?? "";
  const displayNameParam = searchParams.get("displayName") ?? "";
  const legalNameParam = searchParams.get("legalName") ?? "";
  const vendorIdParam = searchParams.get("vendorId") ?? "";
  const vendorInvitationIdParam = searchParams.get("vendorInvitationId") ?? "";

  const setInviteContext = useOnboardingStore((s) => s.setInviteContext);
  const setUser = useAuthStore((s) => s.setUser);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const vendorEmail = emailParam;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const password = watch("password", "");

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    // Populate the store with the full invite context from URL params
    setInviteContext({
      token,
      vendorId: vendorIdParam,
      vendorInvitationId: vendorInvitationIdParam,
      email: emailParam,
      displayName: displayNameParam,
      legalName: legalNameParam,
    });
  }, [
    token,
    emailParam,
    displayNameParam,
    legalNameParam,
    vendorIdParam,
    vendorInvitationIdParam,
    router,
    setInviteContext,
  ]);

  const onSubmit = async (data: FormData) => {
    try {
      await signUp({
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });

      // signUp() only persists cookies — it doesn't return a full user
      // object. Populate the global auth store explicitly so Sidebar,
      // ApprovalGuard, etc. don't see a stale "logged out" state for the
      // rest of this session (Providers' AuthInitializer only hydrates
      // once, before this token existed).
      try {
        const freshUser = await getMe();
        setUser(freshUser);
      } catch {
        // Non-fatal — the dashboard/onboarding layouts will re-fetch via
        // their own guards if this fails; don't block the signup flow.
      }

      toast.success("Account created! Welcome to Villeto 🎉");
      router.push("/onboarding/business-identity");
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Signup failed");
    }
  };

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
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

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8">
          <div className="flex justify-center mb-6">
            <VilletoLogo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-1">
            Sign up as a Vendor
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Set a password and continue your registration process
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Pre-filled email (read-only — comes from invitation) */}
            <FormField label="Business Email">
              <Input
                value={vendorEmail}
                readOnly
                className="bg-muted/50 cursor-default"
              />
            </FormField>

            {/* Password */}
            <FormField
              label="Create a Password"
              required
              error={errors.password?.message}
            >
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  error={!!errors.password}
                  autoComplete="new-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </FormField>

            {/* Confirm password */}
            <FormField
              label="Confirm Password"
              required
              error={errors.confirmPassword?.message}
            >
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  error={!!errors.confirmPassword}
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
                <button
                  type="button"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </FormField>

            {/* Password rule pills */}
            <div className="flex flex-wrap gap-2">
              {RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <span
                    key={rule.key}
                    className={cn(
                      "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-all",
                      passed
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-red-300 bg-red-50 text-red-500"
                    )}
                  >
                    {rule.label}
                  </span>
                );
              })}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full mt-2"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
