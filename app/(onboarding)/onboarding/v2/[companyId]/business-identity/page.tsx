"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { useV2OnboardingStore, fingerprint } from "@/lib/stores/v2OnboardingStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { useSaveV2BusinessIdentity, useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";

const schema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  email: z.string().email("Enter a valid email"),
  registrationNumber: z.string().min(3, "Registration number is required"),
  country: z.string().min(1, "Please select a country"),
  businessAddress: z.string().min(5, "Business address is required"),
  verificationMethod: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function V2BusinessIdentityPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  const { data: company } = useMyCompany(companyId);
  const saveMutation = useSaveV2BusinessIdentity();
  const [isNavigating, setIsNavigating] = useState(false);

  const onboardingStatus = store.onboardingStatus;
  const verificationRequested = onboardingStatus?.verificationRequested ?? false;
  const supportedMethods = onboardingStatus?.supportedVerificationMethods ?? ["cac", "tin"];
  
  const sessionOnboardingMode = useOnboardingStore((s) => s.onboardingMode);
  const sessionBusinessIdentity = useOnboardingStore((s) => s.businessIdentity);
  const companies = useCompanyStore((s) => s.companies);

  // If the vendor has already submitted, completed, or been approved for ANY company,
  // their core business identity is established and shared, so it should be locked.
  const hasEstablishedProfile = companies.some(
    (c) =>
      c.status === "Active" ||
      c.approvalStatus !== null ||
      c.onboardingStatus === "submitted" ||
      c.onboardingStatus === "completed"
  );

  // Vendor already has a verified profile from another company. Legal
  // identity is shared across every company, so it's confirmed — not edited —
  // here. We ONLY lock these fields if the profile has actually been
  // submitted/established somewhere. If the backend flags them as "reuse"
  // but they haven't finished onboarding anywhere yet, they must still be able
  // to correct mistakes.
  const isProfileReuse = hasEstablishedProfile;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: store.businessIdentity.businessName ?? onboardingStatus?.businessIdentity?.businessName ?? sessionBusinessIdentity.business_name ?? "",
      email: store.businessIdentity.email ?? onboardingStatus?.businessIdentity?.email ?? sessionBusinessIdentity.business_email ?? "",
      registrationNumber: store.businessIdentity.registrationNumber ?? onboardingStatus?.businessIdentity?.registrationNumber ?? sessionBusinessIdentity.registration_number ?? "",
      country: store.businessIdentity.country ?? onboardingStatus?.businessIdentity?.country ?? sessionBusinessIdentity.country ?? "",
      businessAddress: store.businessIdentity.businessAddress ?? onboardingStatus?.businessIdentity?.businessAddress ?? sessionBusinessIdentity.business_address ?? "",
      verificationMethod: store.businessIdentity.verificationMethod ?? onboardingStatus?.businessIdentity?.verificationMethod ?? (supportedMethods[0] || ""),
    },
  });

  const onSubmit = async (data: FormData) => {
    const goNext = () => {
      setIsNavigating(true);
      if (verificationRequested) {
        router.push(`/onboarding/v2/${companyId}/verification`);
      } else {
        router.push(`/onboarding/v2/${companyId}/banking`);
      }
    };

    try {
      const payload = { ...data };
      
      // If verification is not requested or the method is empty, don't send it.
      // Sending an empty string fails the backend's strict enum validation.
      if (!verificationRequested || !payload.verificationMethod) {
        delete payload.verificationMethod;
      }

      // Skip the network call when nothing changed: either it matches what
      // the server already holds for this company, or what we last saved.
      const fp = fingerprint(payload);
      const serverFp = fingerprint({
        businessName: onboardingStatus?.businessIdentity?.businessName ?? sessionBusinessIdentity?.business_name ?? "",
        email: onboardingStatus?.businessIdentity?.email ?? sessionBusinessIdentity?.business_email ?? "",
        registrationNumber: onboardingStatus?.businessIdentity?.registrationNumber ?? sessionBusinessIdentity?.registration_number ?? "",
        country: onboardingStatus?.businessIdentity?.country ?? sessionBusinessIdentity?.country ?? "",
        businessAddress: onboardingStatus?.businessIdentity?.businessAddress ?? sessionBusinessIdentity?.business_address ?? "",
        ...(payload.verificationMethod ? { verificationMethod: onboardingStatus?.businessIdentity?.verificationMethod ?? (supportedMethods[0] || "") } : {}),
      });

      if (fp === store.savedFingerprints.businessIdentity || fp === serverFp) {
        store.saveBusinessIdentityLocally(payload);
        goNext();
        return;
      }

      const apiPayload = { ...payload };
      delete (apiPayload as any).email; // Backend rejects any email updates for invited vendors

      await saveMutation.mutateAsync({ companyId, payload: apiPayload });
      store.saveBusinessIdentityLocally(payload);
      store.markStepSaved("businessIdentity", fp);
      goNext();
    } catch (err: any) {
      setIsNavigating(false);
      toast.error(err.message || "Failed to save business identity");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Business Identity
          </h2>
          <p className="text-sm text-muted-foreground">
            {isProfileReuse
              ? "Confirm the details from your existing Villeto profile."
              : "Review and update your official business registration details."}
          </p>
          {isProfileReuse && (
            <div className="mt-4 flex gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-900">
              <ShieldCheck className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />
              <p>
                We&apos;ve pre-filled this from your verified profile. Your legal name, registration
                number and country are shared across every company you work with, so they can&apos;t be
                changed here. Contact Villeto support if any of them are wrong.
              </p>
            </div>
          )}
          {onboardingStatus?.verificationMessage && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              {onboardingStatus.verificationMessage}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FormField label="Business Name" error={errors.businessName?.message}>
              <Input
                placeholder="Your registered business name"
                error={!!errors.businessName}
                readOnly={isProfileReuse}
                className={cn(isProfileReuse && "bg-muted/50 cursor-default")}
                {...register("businessName")}
              />
            </FormField>

            {/* Business Email — locked if provided by invite */}
            <FormField label="Business Email" error={errors.email?.message}>
              <Input
                type="email"
                placeholder="Business email"
                error={!!errors.email}
                readOnly
                className="bg-muted/50 cursor-default"
                {...register("email")}
              />
            </FormField>

            <FormField label="Registration Number / Tax ID" error={errors.registrationNumber?.message}>
              <Input
                placeholder="e.g G442rD42"
                error={!!errors.registrationNumber}
                readOnly={isProfileReuse}
                className={cn(isProfileReuse && "bg-muted/50 cursor-default")}
                {...register("registrationNumber")}
              />
            </FormField>

            {verificationRequested && supportedMethods.length > 0 && (
              <FormField label="Verification Method" error={errors.verificationMethod?.message}>
                <Select
                  onValueChange={(v) => setValue("verificationMethod", v, { shouldValidate: true })}
                  defaultValue={watch("verificationMethod")}
                  disabled={isProfileReuse}
                >
                  <SelectTrigger 
                    error={!!errors.verificationMethod}
                    className={cn(isProfileReuse && "bg-muted/50 opacity-100 cursor-default")}
                  >
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedMethods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormField label="Country" error={errors.country?.message}>
              <CountrySelect
                value={watch("country")}
                onChange={(c) => setValue("country", c.name, { shouldValidate: true })}
                error={!!errors.country}
                disabled={isProfileReuse}
              />
            </FormField>

            <FormField label="Business Address" error={errors.businessAddress?.message}>
              <Input
                placeholder="Registered address"
                error={!!errors.businessAddress}
                {...register("businessAddress")}
              />
            </FormField>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting || saveMutation.isPending || isNavigating}
                className="w-full"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
