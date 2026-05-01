"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounce } from "use-debounce";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { magicLookupBusiness, saveBusinessIdentity } from "@/lib/api/onboarding";
import { fuzzyMatchScore } from "@/lib/utils";
import { toast } from "sonner";
import Cookies from "js-cookie";
import { cn } from "@/lib/utils";

const schema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  business_email: z.string().email("Enter a valid email"),
  registration_number: z.string().min(3, "Registration number is required"),
  country: z.string().min(1, "Please select a country"),
  business_address: z.string().min(5, "Business address is required"),
});

type FormData = z.infer<typeof schema>;

const COUNTRIES = [
  "Nigeria", "Ghana", "Kenya", "South Africa", "United Kingdom",
  "United States", "Canada", "Scotland", "Other",
];

type MatchStatus = "idle" | "checking" | "match" | "mismatch";

export default function BusinessIdentityPage() {
  const router = useRouter();
  const store = useOnboardingStore();
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("idle");
  const [resolvedName, setResolvedName] = useState("");

  const isMockSession = Cookies.get("villeto_onboarding_session") === "mock-session";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: store.businessIdentity.business_name ?? store.businessName ?? "",
      business_email: store.businessIdentity.business_email ?? store.vendorEmail ?? (isMockSession ? "mock@villeto.com" : ""),
      registration_number: store.businessIdentity.registration_number ?? "",
      country: store.businessIdentity.country ?? "",
      business_address: store.businessIdentity.business_address ?? "",
    },
  });

  const businessName = watch("business_name");
  const regNumber = watch("registration_number");
  const [debouncedReg] = useDebounce(regNumber, 800);
  const [debouncedName] = useDebounce(businessName, 600);
  const prevResolvedRef = useRef("");

  /**
   * Magic Lookup + Name match check
   * When reg number has ≥5 chars, call backend to resolve business name
   * Then run fuzzy match against what the vendor typed
   *
   * INTEGRATION POINT: real API call in magicLookupBusiness()
   */
  useEffect(() => {
    if (debouncedReg.length < 5) {
      setMatchStatus("idle");
      return;
    }

    setMatchStatus("checking");

    magicLookupBusiness(debouncedReg)
      .then((result) => {
        setResolvedName(result.business_name);
        prevResolvedRef.current = result.business_name;

        if (!debouncedName) {
          // Auto-fill address + country from lookup
          if (result.business_address) setValue("business_address", result.business_address);
          if (result.country) setValue("country", result.country);
          setMatchStatus("idle");
          return;
        }

        const score = fuzzyMatchScore(debouncedName, result.business_name);
        setMatchStatus(score >= 70 ? "match" : "mismatch");
      })
      .catch(() => {
        setMatchStatus("idle");
      });
  }, [debouncedReg, debouncedName, setValue]);

  // Re-check name match when name changes (if we already have resolved name)
  useEffect(() => {
    if (!prevResolvedRef.current || !debouncedName || debouncedReg.length < 5) return;
    const score = fuzzyMatchScore(debouncedName, prevResolvedRef.current);
    setMatchStatus(score >= 70 ? "match" : "mismatch");
  }, [debouncedName, debouncedReg]);

  const onSubmit = async (data: FormData) => {
    try {
      await saveBusinessIdentity(data);
      store.saveBusinessIdentity(data);
      router.push("/onboarding/banking");
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Failed to save. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <OnboardingStepper currentStep="business-identity" />

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-8">
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Business Identity
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Enter your official business registration details.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Business Name with match indicator */}
          <FormField
            label="Business Name"
            error={errors.business_name?.message}
          >
            <div className="relative">
              <Input
                placeholder="Your registered business name"
                error={!!errors.business_name}
                {...register("business_name")}
                className={cn(
                  matchStatus === "match" && "border-green-400 focus:border-green-400 focus:ring-green-100",
                  matchStatus === "mismatch" && "border-red-400 focus:border-red-400 focus:ring-red-100"
                )}
              />
              {matchStatus !== "idle" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {matchStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {matchStatus === "match" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {matchStatus === "mismatch" && <XCircle className="h-4 w-4 text-red-500" />}
                </div>
              )}
            </div>
            {matchStatus === "mismatch" && resolvedName && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <XCircle className="h-3 w-3 shrink-0" />
                Name does not match registration records. Found: <strong>&quot;{resolvedName}&quot;</strong>
              </p>
            )}
            {matchStatus === "match" && (
              <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                Name matches registration records
              </p>
            )}
          </FormField>

          {/* Business Email (pre-filled, read-only) */}
          <FormField
            label="Business Email"
            error={errors.business_email?.message}
          >
            <Input
              type="email"
              readOnly={!isMockSession}
              className={cn(!isMockSession && "bg-muted/50 cursor-default")}
              {...register("business_email")}
            />
            {isMockSession && (
              <p className="text-[10px] text-amber-600 font-medium mt-1">
                TEST MODE: Email is editable during mock session
              </p>
            )}
          </FormField>

          {/* Registration Number — triggers magic lookup */}
          <FormField
            label="Registration Number / Tax ID"
            error={errors.registration_number?.message}
          >
            <div className="relative">
              <Input
                placeholder="e.g G442rD42"
                error={!!errors.registration_number}
                {...register("registration_number")}
              />
              {matchStatus === "checking" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </FormField>

          {/* Country */}
          <FormField label="Country" error={errors.country?.message}>
            <Select
              onValueChange={(v) => setValue("country", v, { shouldValidate: true })}
              defaultValue={store.businessIdentity.country}
            >
              <SelectTrigger error={!!errors.country}>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Business Address */}
          <FormField
            label="Business Address"
            error={errors.business_address?.message}
          >
            <Input
              placeholder="Registered address"
              error={!!errors.business_address}
              {...register("business_address")}
            />
          </FormField>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8"
              onClick={() => router.back()}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="flex-1"
            >
              Continue
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
