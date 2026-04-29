"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounce } from "use-debounce";
import { AlertCircle, Loader2 } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/Select";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { resolveAccountName, getBankList, saveBankingDetails } from "@/lib/api/onboarding";
import { fuzzyMatchScore } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  bank_code: z.string().min(1, "Select a bank"),
  bank_name: z.string().min(1, "Select a bank"),
  account_number: z.string().length(10, "Account number must be 10 digits"),
  flag_note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Bank { code: string; name: string; }

// Mock banks — replaced by real getBankList() call
const MOCK_BANKS: Bank[] = [
  { code: "057", name: "Zenith bank" },
  { code: "044", name: "Access Bank" },
  { code: "058", name: "GTBank" },
  { code: "011", name: "First Bank" },
  { code: "033", name: "UBA" },
  { code: "023", name: "Citibank" },
  { code: "050", name: "Ecobank" },
];

export default function BankingPage() {
  const router = useRouter();
  const store = useOnboardingStore();

  const [banks, setBanks] = useState<Bank[]>(MOCK_BANKS);
  const [resolvedName, setResolvedName] = useState<string>("");
  const [resolving, setResolving] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
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
      account_number: store.banking.account_number ?? "",
      flag_note: store.banking.flag_note ?? "",
    },
  });

  const bankCode = watch("bank_code");
  const accountNumber = watch("account_number");
  const [debouncedAccount] = useDebounce(accountNumber, 700);

  // Load bank list on mount
  useEffect(() => {
    getBankList("NG")
      .then(setBanks)
      .catch(() => { /* use mock */ });
  }, []);

  /**
   * ACCOUNT RESOLVE
   * Fires when bank + 10-digit account number are both present.
   * Resolves account holder name, then fuzzy-matches against business name.
   *
   * INTEGRATION POINT: real call in resolveAccountName()
   */
  useEffect(() => {
    if (!bankCode || debouncedAccount.length !== 10) {
      setResolvedName("");
      setMatchScore(null);
      return;
    }

    setResolving(true);
    resolveAccountName({ bank_code: bankCode, account_number: debouncedAccount })
      .then((res) => {
        setResolvedName(res.account_name);
        const businessName = store.businessIdentity.business_name ?? "";
        const score = fuzzyMatchScore(businessName, res.account_name);
        setMatchScore(score);
      })
      .catch(() => {
        setResolvedName("");
        setMatchScore(null);
        toast.error("Could not resolve account name. Check details and try again.");
      })
      .finally(() => setResolving(false));
  }, [bankCode, debouncedAccount, store.businessIdentity.business_name]);

  const onSubmit = async (data: FormData) => {
    // Block submission if name is a total mismatch (score < 50) AND no note
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
      router.push("/onboarding/documents");
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Failed to save banking details.");
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <OnboardingStepper currentStep="banking" />

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-8">
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Banking Details
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Where should we send your payments?
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Bank selector */}
          <FormField label="Bank Name" error={errors.bank_name?.message}>
            <Select
              onValueChange={(v) => {
                const bank = banks.find((b) => b.code === v);
                setValue("bank_code", v, { shouldValidate: true });
                setValue("bank_name", bank?.name ?? "", { shouldValidate: true });
              }}
              defaultValue={store.banking.bank_code}
            >
              <SelectTrigger error={!!errors.bank_name}>
                <SelectValue placeholder="Select bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Account number */}
          <FormField
            label="Account Number"
            error={errors.account_number?.message}
          >
            <div className="relative">
              <Input
                placeholder="0000000000"
                maxLength={10}
                error={!!errors.account_number}
                {...register("account_number")}
              />
              {resolving && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
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
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
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
              loading={isSubmitting}
              disabled={resolving}
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
