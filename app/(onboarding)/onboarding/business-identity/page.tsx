"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounce } from "use-debounce";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { magicLookupBusiness, saveBusinessIdentity } from "@/lib/api/onboarding";
import { fuzzyMatchScore } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  business_email: z.string().email("Enter a valid email"),
  registration_number: z.string().min(3, "Registration number is required"),
  country: z.string().min(1, "Please select a country"),
  business_address: z.string().min(5, "Business address is required"),
});

type FormData = z.infer<typeof schema>;

type MatchStatus = "idle" | "checking" | "match" | "mismatch";

export default function BusinessIdentityPage() {
  const router = useRouter();
  const store = useOnboardingStore();
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("idle");
  const [resolvedName, setResolvedName] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  // The invite gave us both a display name and a legal/registered name.
  // legalBusinessName is the canonical value to pre-fill (e.g. "Acme Supplies Limited").
  // businessName (displayName) is the fallback.
  const inviteBusinessName =
    store.legalBusinessName || store.businessName || null;
  const inviteEmail = store.vendorEmail || null;

  // Fields locked by the invitation — vendor cannot change them
  const isBusinessNameLocked = !!inviteBusinessName;
  const isEmailLocked = !!inviteEmail;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name:
        store.businessIdentity.business_name ?? inviteBusinessName ?? "",
      business_email:
        store.businessIdentity.business_email ?? inviteEmail ?? "",
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
   * Sync invite-context values into the form after Zustand's persist
   * middleware hydrates from sessionStorage (which happens asynchronously,
   * after the first render). Without this, defaultValues from useForm() are
   * captured at mount time before the store is hydrated, leaving the fields
   * empty even when the invite context is available.
   */
  useEffect(() => {
    if (inviteBusinessName && !businessName && !prevResolvedRef.current) {
      setValue("business_name", inviteBusinessName, { shouldValidate: false });
    }
    if (inviteEmail) {
      // Need to check form value, so we can watch it or use getValues.
      // Since business_email isn't watched globally, we can use a quick check or just set it if it's currently empty in the store at mount.
      // Actually, it's safer to just set it. useForm's defaultValues might have missed it.
      setValue("business_email", inviteEmail, { shouldValidate: false });
    }
  }, [inviteBusinessName, inviteEmail, businessName, setValue]);

  /**
   * Magic Lookup + Name match check
   * When reg number has ≥5 chars, call backend to resolve business name.
   * If the business name is pre-filled from the invitation, auto-run the
   * match check against the resolved name.
   */
  useEffect(() => {
    if (debouncedReg.length < 5) {
      setMatchStatus("idle");
      return;
    }

    setMatchStatus("checking");
    let isStale = false;

    magicLookupBusiness(debouncedReg)
      .then((result) => {
        if (isStale) return;
        setResolvedName(result.business_name);
        prevResolvedRef.current = result.business_name;

        if (!debouncedName) {
          if (result.business_address)
            setValue("business_address", result.business_address);
          if (result.country) setValue("country", result.country);
          setMatchStatus("idle");
          return;
        }

        const score = fuzzyMatchScore(debouncedName, result.business_name);
        setMatchStatus(score >= 70 ? "match" : "mismatch");
      })
      .catch(() => {
        if (!isStale) setMatchStatus("idle");
      });

    return () => {
      isStale = true;
    };
  }, [debouncedReg, debouncedName, setValue]);

  // Re-check name match when the name field changes
  useEffect(() => {
    if (!prevResolvedRef.current || !debouncedName || debouncedReg.length < 5)
      return;
    const score = fuzzyMatchScore(debouncedName, prevResolvedRef.current);
    setMatchStatus(score >= 70 ? "match" : "mismatch");
  }, [debouncedName, debouncedReg]);

  const onSubmit = async (data: FormData) => {
    try {
      await saveBusinessIdentity(data);
      store.saveBusinessIdentity(data);
      setIsNavigating(true);
      router.push("/onboarding/banking");
    } catch (err: unknown) {
      setIsNavigating(false);
      toast.error(
        (err as { message?: string })?.message ?? "Failed to save. Please try again."
      );
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      {/* Form card — flex-1 min-h-0 allows it to shrink to fit the screen, overflow-hidden clips corners */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        
        {/* Fixed header inside the card */}
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Business Identity
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter your official business registration details.
            {isBusinessNameLocked && (
              <span className="ml-1 text-primary font-medium">
                Fields pre-filled from your invitation cannot be changed.
              </span>
            )}
          </p>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Business Name — locked if provided by invite */}
          <FormField
            label="Business Name"
            error={errors.business_name?.message}
          >
            <div className="relative">
              <Input
                placeholder="Your registered business name"
                error={!!errors.business_name}
                readOnly={isBusinessNameLocked}
                {...register("business_name")}
                className={cn(
                  isBusinessNameLocked && "bg-muted/50 cursor-default",
                  matchStatus === "match" &&
                    "border-green-400 focus:border-green-400 focus:ring-green-100",
                  matchStatus === "mismatch" &&
                    "border-red-400 focus:border-red-400 focus:ring-red-100"
                )}
              />
              {matchStatus !== "idle" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {matchStatus === "checking" && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only" role="status">Checking registration records…</span>
                    </>
                  )}
                  {matchStatus === "match" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  )}
                  {matchStatus === "mismatch" && (
                    <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
                  )}
                </div>
              )}
            </div>
            {matchStatus === "mismatch" && resolvedName && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                Name does not match registration records. Found:{" "}
                <strong>&quot;{resolvedName}&quot;</strong>
              </p>
            )}
            {matchStatus === "match" && (
              <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                Name matches registration records
              </p>
            )}
          </FormField>

          {/* Business Email — locked if provided by invite */}
          <FormField
            label="Business Email"
            error={errors.business_email?.message}
          >
            <Input
              type="email"
              readOnly={isEmailLocked}
              className={cn(isEmailLocked && "bg-muted/50 cursor-default")}
              {...register("business_email")}
            />
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
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                </div>
              )}
            </div>
          </FormField>

          {/* Country */}
          <FormField label="Country" error={errors.country?.message}>
            <CountrySelect
              value={watch("country")}
              onChange={(c) => setValue("country", c.name, { shouldValidate: true })}
              error={!!errors.country}
            />
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
              loading={isSubmitting || isNavigating}
              className="flex-1"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
