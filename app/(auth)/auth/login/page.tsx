"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { login } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/stores/authStore";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const { setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await login(data);
      setUser(res.user);
      router.push(next);
    } catch (err: unknown) {
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
              loading={isSubmitting}
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
