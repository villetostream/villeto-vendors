"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounce } from "use-debounce";
import { AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/Select";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { resolveAccountName, saveBankingDetails } from "@/lib/api/onboarding";
import { COUNTRIES } from "@/lib/constants/countries";
import { getBanksForCountry } from "@/lib/constants/banks";
import { fuzzyMatchScore } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  bank_code: z.string().min(1, "Select a bank"),
  bank_name: z.string().min(1, "Select a bank"),
  routing_number: z.string().optional(),
  account_number: z.string().min(5, "Account number must be at least 5 digits"),
  flag_note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Bank { code: string; name: string; routingNumber?: string; }

export default function BankingPage() {
  const router = useRouter();
  const store = useOnboardingStore();

  const [banks, setBanks] = useState<Bank[]>([]);
  const [resolvedName, setResolvedName] = useState<string>("");
  const [resolving, setResolving] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const isFlagged = matchScore !== null && matchScore < 90;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bank_code: store.banking.bank_code ?? "",
      bank_name: store.banking.bank_name ?? "",
      routing_number: store.banking.routing_number ?? "",
      account_number: store.banking.account_number ?? "",
      flag_note: store.banking.flag_note ?? "",
    },
  });

  const bankCode = watch("bank_code");
  const accountNumber = watch("account_number");
  const [debouncedAccount] = useDebounce(accountNumber, 700);

  // Load banks synchronously from static list.
  // Handles three forms store.businessIdentity.country may take:
  //   "Nigeria"  → name match → "NG"
  //   "NG"       → direct ISO code (if server stored it that way)
  //   null/""    → show empty state
  useEffect(() => {
    const raw = store.businessIdentity.country?.trim() ?? "";

    if (!raw) {
      setBanks([]);
      return;
    }

    // Try 1: exact name match ("Nigeria" → "NG")
    const byName = COUNTRIES.find(
      (c) => c.name.toLowerCase() === raw.toLowerCase()
    );

    // Try 2: direct ISO code match ("NG" → "NG")
    const byCode = !byName
      ? COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase())
      : null;

    const countryCode = byName?.code ?? byCode?.code ?? raw.toUpperCase();
    const list = getBanksForCountry(countryCode);
    setBanks(list);
  }, [store.businessIdentity.country]);

  /**
   * ACCOUNT RESOLVE
   * Fires when bank + 5+ digit account number are both present.
   * Resolves account holder name, then fuzzy-matches against business name.
   * Submission is blocked below a 90-point match score unless a note is added.
   *
   * INTEGRATION POINT: real call in resolveAccountName()
   */
  useEffect(() => {
    if (!bankCode || debouncedAccount.length < 5) {
      setResolvedName("");
      setMatchScore(null);
      return;
    }

    // Guards against a slow/late response overwriting state set by a more
    // recent request (e.g. the vendor kept typing while the first request
    // was still in flight).
    let isStale = false;

    setResolving(true);
    resolveAccountName({ bank_code: bankCode, account_number: debouncedAccount })
      .then((res) => {
        if (isStale) return;
        setResolvedName(res.account_name);
        const businessName = store.businessIdentity.business_name ?? "";
        const score = fuzzyMatchScore(businessName, res.account_name);
        setMatchScore(score);
      })
      .catch(() => {
        if (isStale) return;
        setResolvedName("");
        setMatchScore(null);
        toast.error("Could not resolve account name. Check details and try again.");
      })
      .finally(() => {
        if (!isStale) setResolving(false);
      });

    return () => {
      isStale = true;
    };
  }, [bankCode, debouncedAccount, store.businessIdentity.business_name]);

  const onSubmit = async (data: FormData) => {
    // Block submission if the resolved account name doesn't reasonably
    // match the business name (score < 90) unless the vendor adds a note.
    if (isFlagged && !data.flag_note?.trim()) {
      toast.error("Please add a note explaining the name mismatch before continuing.");
      return;
    }

    try {
      await saveBankingDetails(data);
      store.saveBanking(
        data,
        resolvedName,
        matchScore ?? 100
      );
      setIsNavigating(true);
      router.push("/onboarding/documents");
    } catch (err: unknown) {
      setIsNavigating(false);
      toast.error((err as { message?: string })?.message ?? "Failed to save banking details.");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full">
      <div className="shrink-0 pb-6">
        <OnboardingStepper currentStep="banking" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 flex-1 flex flex-col min-h-0 mb-4">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Banking Details
          </h2>
          <p className="text-sm text-muted-foreground">
            Where should we send your payments?
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6 pr-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Bank selector — dropdown if country banks are known, text input fallback otherwise */}
          <FormField label="Bank Name" error={errors.bank_name?.message}>
            {!store.businessIdentity.country ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                No country selected. Please{" "}
                <button
                  type="button"
                  className="underline font-medium"
                  onClick={() => router.push("/onboarding/business-identity")}
                >
                  go back and select a country
                </button>{" "}
                in the business identity step.
              </div>
            ) : banks.length > 0 ? (
              <Select
                onValueChange={(v) => {
                  const bank = banks.find((b) => b.code === v);
                  setValue("bank_code", v, { shouldValidate: true });
                  setValue("bank_name", bank?.name ?? "", { shouldValidate: true });
                  setValue("routing_number", bank?.routingNumber ?? "");
                }}
                defaultValue={store.banking.bank_code}
              >
                <SelectTrigger error={!!errors.bank_name}>
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent avoidCollisions sideOffset={6}>
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Enter your bank name"
                  error={!!errors.bank_name}
                  {...register("bank_name", {
                    onChange: (e) => {
                      setValue("bank_code", e.target.value.toUpperCase().replace(/\s+/g, "_").slice(0, 12));
                    },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Banks for <strong>{store.businessIdentity.country}</strong> are not pre-loaded. Please type your bank name directly.
                </p>
              </div>
            )}
          </FormField>

          {/* Account number */}
          <FormField
            label="Account Number"
            error={errors.account_number?.message}
          >
            <div className="relative">
              <Input
                placeholder="0000000000"
                error={!!errors.account_number}
                {...register("account_number")}
              />
              {resolving && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                  <span className="sr-only" role="status">Resolving account name…</span>
                </div>
              )}
            </div>

            {/* Resolved name pill */}
            {resolvedName && !resolving && (
              <p className={cn(
                "text-sm font-medium mt-2",
                isFlagged ? "text-amber-600" : "text-primary"
              )}>
                {resolvedName}
              </p>
            )}
          </FormField>

          {/* Flag warning + note input */}
          {isFlagged && resolvedName && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Flagged</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your account name is not matching your business name.
                    Confirm the account details or add a note to explain.
                  </p>
                </div>
              </div>
              <FormField label="Add Note" error={errors.flag_note?.message}>
                <Input
                  placeholder="Enter note..."
                  className="bg-white border-amber-200 focus:border-amber-400 focus:ring-amber-100"
                  {...register("flag_note")}
                />
              </FormField>
            </div>
          )}

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
              disabled={resolving}
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
