"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { signUp } from "@/lib/api/auth";
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
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormData = z.infer<typeof schema>;

const RULES = [
  { key: "length", label: "8+ characters", test: (p: string) => p.length >= 8 },
  { key: "number", label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { key: "upper", label: "Uppercase Letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "Lowercase Letter", test: (p: string) => /[a-z]/.test(p) },
];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { setInviteContext, businessIdentity } = useOnboardingStore();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [vendorEmail, setVendorEmail] = useState("abcsupplies@gmail.com");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const password = watch("password", "");

  // In production, fetch token payload from API to get the real email
  useEffect(() => {
    if (!token) router.replace("/auth/login");
    // INTEGRATION POINT: fetch token metadata to get pre-filled email
    // const data = await validateInviteToken(token);
    // setVendorEmail(data.email);
    // setInviteContext(token, data.email, data.business_name);
  }, [token, router]);

  const onSubmit = async (data: FormData) => {
    try {
      await signUp({ token, password: data.password, confirm_password: data.confirm_password });
      router.push("/onboarding/business-identity");
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Signup failed");
    }
  };

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

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
            {/* Pre-filled email (read-only) */}
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
                  {...register("password")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            {/* Confirm password */}
            <FormField
              label="Confirm Password"
              required
              error={errors.confirm_password?.message}
            >
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  error={!!errors.confirm_password}
                  {...register("confirm_password")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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
