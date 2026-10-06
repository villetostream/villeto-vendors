"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { useForgotPassword } from "@/lib/hooks/useAuth";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const forgotPasswordMutation = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await forgotPasswordMutation.mutateAsync(data.email);
      toast.success("Recovery code sent successfully");
      router.push(`/auth/reset-password?email=${encodeURIComponent(data.email)}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to request recovery code");
    }
  };

  return (
    <div className="min-h-screen onboarding-bg flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{ backgroundImage: "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />

      <header className="relative z-10 px-6 py-5 shrink-0">
        <VilletoLogo size="md" />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border/50 p-8 my-auto">
          <Link href="/auth/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            Reset Password
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Enter your email address and we'll send you a recovery code to reset your password.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <FormField label="Email Address" required error={errors.email?.message}>
              <Input
                type="email"
                placeholder="Enter email address"
                error={!!errors.email}
                autoComplete="email"
                {...register("email")}
              />
            </FormField>

            <Button type="submit" variant="primary" size="lg" loading={isSubmitting || forgotPasswordMutation.isPending} className="w-full">
              Send Recovery Code
              <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
