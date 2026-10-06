"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useVerifyVendor } from "@/lib/hooks/useVendorNetwork";
import { PageSpinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function V2VerificationPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  const verifyMutation = useVerifyVendor();
  const [isNavigating, setIsNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onboardingStatus = store.onboardingStatus;
  
  useEffect(() => {
    if (mounted && onboardingStatus && !onboardingStatus.verificationRequested) {
      router.replace(`/onboarding/${companyId}/banking`);
    }
  }, [mounted, onboardingStatus, companyId, router]);

  if (!mounted || !onboardingStatus || !onboardingStatus.verificationRequested) {
    return null;
  }

  const identity = store.businessIdentity;
  const method = identity.verificationMethod || "cac";
  const identifier = identity.registrationNumber || "";
  const name = identity.businessName || "";

  const handleVerify = async () => {
    try {
      await verifyMutation.mutateAsync({
        companyId,
        method,
        identifier,
        expectedLegalName: name,
      });
      toast.success("Verification successful");
      setIsNavigating(true);
      router.push(`/onboarding/${companyId}/banking`);
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10 text-center">
          <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Identity Verification
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The company has requested we verify your business identity using the provided {method.toUpperCase()}.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <div className="bg-slate-50 border border-border/50 rounded-xl p-5 mb-8">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Business Name</p>
                <p className="font-medium text-sm">{name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{method.toUpperCase()} / Registration No.</p>
                <p className="font-medium text-sm">{identifier}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8"
              onClick={() => router.back()}
              disabled={verifyMutation.isPending || isNavigating}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleVerify}
              loading={verifyMutation.isPending || isNavigating}
              className="flex-1"
            >
              Verify & Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
