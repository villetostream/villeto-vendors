"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, ArrowRight } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { useResetPassword } from "@/lib/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  code: z.string().min(6, "Code must be at least 6 characters"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") || "";
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const resetPasswordMutation = useResetPassword();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail }
  });

  const pwd = watch("newPassword") || "";
  const validations = {
    length: pwd.length >= 8,
    number: /[0-9]/.test(pwd),
    uppercase: /[A-Z]/.test(pwd),
    lowercase: /[a-z]/.test(pwd),
  };

  const onSubmit = async (data: FormData) => {
    try {
      await resetPasswordMutation.mutateAsync({
        email: data.email,
        code: data.code,
        newPassword: data.newPassword,
      });
      toast.success("Password reset successfully. Please login.");
      router.push("/auth/login");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password. The code might be invalid or expired.");
    }
  };

  return (
    <div className="h-screen onboarding-bg flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

      <header className="relative z-10 px-6 py-5 shrink-0">
        <VilletoLogo size="md" />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 overflow-hidden min-h-0">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 flex flex-col overflow-hidden max-h-[calc(100vh-100px)]">
          
          <div className="shrink-0 p-8 pb-4 bg-white relative z-10">
            <Link href="/auth/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to login
            </Link>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              Create New Password
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter the recovery code sent to your email and your new password.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-8 py-2 space-y-5">
              <FormField label="Email Address" required error={errors.email?.message}>
                <Input
                  type="email"
                  placeholder="Enter email address"
                  error={!!errors.email}
                  {...register("email")}
                />
              </FormField>

              <FormField label="Recovery Code" required error={errors.code?.message}>
                <Input
                  placeholder="Enter 6-digit code"
                  error={!!errors.code}
                  {...register("code")}
                />
              </FormField>

              <FormField label="New Password" required error={errors.newPassword?.message}>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    error={!!errors.newPassword}
                    {...register("newPassword")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>

              <FormField label="Confirm Password" required error={errors.confirmPassword?.message}>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    error={!!errors.confirmPassword}
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm(!showConfirm)}
                  >
                    {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>

              <div className="flex flex-wrap gap-2 pt-1 pb-4">
                <span className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors", validations.length ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600")}>8+ characters</span>
                <span className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors", validations.number ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600")}>Number</span>
                <span className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors", validations.uppercase ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600")}>Uppercase Letter</span>
                <span className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors", validations.lowercase ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600")}>Lowercase Letter</span>
              </div>
            </div>

            <div className="shrink-0 p-8 pt-4 border-t border-border/30 bg-white relative z-10 shadow-[0_-4px_10px_-10px_rgba(0,0,0,0.1)]">
              <Button type="submit" variant="primary" size="lg" loading={isSubmitting || resetPasswordMutation.isPending} className="w-full">
                Reset Password
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
              </Button>
            </div>
          </form>

        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
