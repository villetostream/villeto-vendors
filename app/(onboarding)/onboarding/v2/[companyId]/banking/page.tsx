"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { useV2OnboardingStore, fingerprint } from "@/lib/stores/v2OnboardingStore";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { useSavedBankAccounts, useSaveV2BankingDetails } from "@/lib/hooks/useVendorNetwork";
import { getBanksForCountry } from "@/lib/constants/banks";
import { COUNTRIES } from "@/lib/constants/countries";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  bankCode: z.string().min(1, "Select a bank"),
  bankName: z.string().min(1, "Select a bank"),
  accountName: z.string().min(2, "Account name is required"),
  accountNumber: z.string().min(10, "Account number must be at least 10 digits"),
});
type FormData = z.infer<typeof schema>;

export default function V2BankingPage({ params }: { params: Promise<{ companyId: string }> }) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  
  const { data: savedAccounts = [], isLoading: loadingAccounts } = useSavedBankAccounts();
  const sessionBanking = useOnboardingStore((s) => s.banking);

  const effectiveAccounts = useMemo(() => {
    const list = [...savedAccounts];
    if (sessionBanking?.account_number && sessionBanking?.bank_name) {
      const isAlreadySaved = list.some(a => a.maskedAccountNumber.includes(sessionBanking.account_number!.slice(-4)));
      if (!isAlreadySaved) {
        list.unshift({
          bankOptionId: "legacy-global",
          bankName: sessionBanking.bank_name,
          bankCode: sessionBanking.bank_code || "",
          accountName: "",
          maskedAccountNumber: "••••" + sessionBanking.account_number.slice(-4),
        });
      }
    }
    return list;
  }, [savedAccounts, sessionBanking]);

  const saveMutation = useSaveV2BankingDetails();
  
  const [mode, setMode] = useState<"reuse" | "new">("reuse");
  const [selectedBankOptionId, setSelectedBankOptionId] = useState<string>(store.selectedBankOptionId ?? "");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (loadingAccounts) return;
    if (effectiveAccounts.length === 0) {
      setMode("new");
      return;
    }
    // Returning vendor: pre-select the account they used before (or the only
    // one they have) so confirming is a single click.
    setSelectedBankOptionId((prev) => {
      if (prev && effectiveAccounts.some((a) => a.bankOptionId === prev)) return prev;
      return effectiveAccounts.length === 1 ? effectiveAccounts[0].bankOptionId : prev;
    });
  }, [loadingAccounts, effectiveAccounts]);



  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bankCode: store.bankingMode === "new" ? (store.bankingDetails?.bankCode ?? "") : "",
      bankName: store.bankingMode === "new" ? (store.bankingDetails?.bankName ?? "") : "",
      accountName: store.bankingMode === "new" ? (store.bankingDetails?.accountName ?? "") : "",
      accountNumber: store.bankingMode === "new" ? (store.bankingDetails?.accountNumber ?? "") : "",
    }
  });

  const bankCode = watch("bankCode");
  const bankName = watch("bankName");
  const accountNumber = watch("accountNumber");
  const [debouncedAccount] = useDebounce(accountNumber, 700);

  useEffect(() => {
    const raw = store.businessIdentity.country?.trim() ?? "";
    if (!raw) return;
    const byName = COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
    const byCode = !byName ? COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase()) : null;
    const countryCode = byName?.code ?? byCode?.code ?? raw.toUpperCase();
    
    const loadedBanks = getBanksForCountry(countryCode);
    setBanks(loadedBanks);
    
    // Auto-match bankCode if we have a pre-filled bankName but no bankCode
    if (bankName && !bankCode && loadedBanks.length > 0) {
      const match = loadedBanks.find(b => b.name.toLowerCase() === bankName.toLowerCase());
      if (match) {
        setValue("bankCode", match.code, { shouldValidate: true });
      }
    }
  }, [store.businessIdentity.country, bankName, bankCode, setValue]);



  const onNextStep = () => {
    if (store.onboardingStatus?.documentsRequired) {
      router.push(`/onboarding/v2/${companyId}/documents`);
    } else {
      router.push(`/onboarding/v2/${companyId}/review`);
    }
  };

  const handleReuse = async () => {
    if (!selectedBankOptionId) {
      toast.error("Please select a bank account");
      return;
    }
    try {
      const fp = fingerprint({ mode: "reuse", bankOptionId: selectedBankOptionId });
      
      // Handle legacy global account that hasn't been migrated to V2 options yet
      if (selectedBankOptionId === "legacy-global") {
        if (fp !== store.savedFingerprints.banking) {
          setIsNavigating(true);
          let bCode = sessionBanking?.bank_code;
          if (!bCode) {
            const match = banks.find(b => b.name.toLowerCase() === sessionBanking?.bank_name?.toLowerCase());
            bCode = match?.code || "";
          }
          if (!bCode) throw new Error("Could not verify legacy bank. Please add it as a new account.");
          
          await saveMutation.mutateAsync({
            companyId,
            payload: {
              bankName: sessionBanking!.bank_name!,
              bankCode: bCode,
              accountNumber: sessionBanking!.account_number!,
              accountName: "Legacy Account",
            }
          });
          
          store.markStepSaved("banking", fp);
          store.setBankingMode("reuse");
          store.saveBankingDetailsLocally({
            bankName: sessionBanking!.bank_name!,
            accountNumber: sessionBanking!.account_number!,
            accountName: "Legacy Account",
          });
        }
        setIsNavigating(true);
        onNextStep();
        return;
      }

      // Same account already linked to this company → no need to call again.
      if (fp !== store.savedFingerprints.banking) {
        await saveMutation.mutateAsync({ 
          companyId, 
          payload: { bankOptionId: selectedBankOptionId } as any 
        });
        store.markStepSaved("banking", fp);
      }
      store.setSelectedBankOptionId(selectedBankOptionId);
      store.setBankingMode("reuse");
      
      const reusedBank = effectiveAccounts.find(b => b.bankOptionId === selectedBankOptionId);
      if (reusedBank) {
        store.saveBankingDetailsLocally({
          bankName: reusedBank.bankName,
          accountNumber: reusedBank.maskedAccountNumber,
          accountName: reusedBank.accountName,
        });
      }
      setIsNavigating(true);
      onNextStep();
    } catch (err: any) {
      setIsNavigating(false);
      toast.error(err.message || "Failed to reuse bank account");
      if (selectedBankOptionId === "legacy-global") {
        setMode("new"); // Fallback to manual entry if auto-verify fails
      }
    }
  };

  const handleNew = async (data: FormData) => {
    try {
      const fp = fingerprint({ mode: "new", bankCode: data.bankCode, accountNumber: data.accountNumber });
      if (fp !== store.savedFingerprints.banking) {
        await saveMutation.mutateAsync({
          companyId,
          payload: {
            bankName: data.bankName,
            bankCode: data.bankCode,
            accountNumber: data.accountNumber,
            accountName: data.accountName,
          }
        });
        store.markStepSaved("banking", fp);
      }
      store.setBankingMode("reuse");
      store.saveBankingDetailsLocally({
        bankName: "",
        accountNumber: "",
        accountName: "",
      });
      setIsNavigating(true);
      onNextStep();
    } catch (err: any) {
      toast.error(err.message || "Failed to save banking details");
    }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">Banking Details</h2>
          <p className="text-sm text-muted-foreground">
            Where should we send your payments?
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6">
          {effectiveAccounts.length > 0 && (
            <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setMode("reuse")}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                  mode === "reuse" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Use Saved Account
              </button>
              <button
                onClick={() => setMode("new")}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                  mode === "new" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Add New Account
              </button>
            </div>
          )}

          {mode === "reuse" && effectiveAccounts.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                {effectiveAccounts.map((acc) => (
                  <div
                    key={acc.bankOptionId}
                    onClick={() => setSelectedBankOptionId(acc.bankOptionId)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                      selectedBankOptionId === acc.bankOptionId
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                      selectedBankOptionId === acc.bankOptionId ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{acc.bankName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {acc.maskedAccountNumber}
                        {acc.accountName ? ` • ${acc.accountName}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-6 mt-4 border-t border-border/50">
                <Button variant="outline" size="lg" className="px-8" onClick={() => router.back()}>Back</Button>
                <Button 
                  variant="primary" 
                  size="lg" 
                  className="flex-1" 
                  onClick={handleReuse}
                  disabled={!selectedBankOptionId}
                  loading={saveMutation.isPending || isNavigating}
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(handleNew)} className="space-y-5">
              <FormField label="Bank Name" error={errors.bankName?.message}>
                {banks.length > 0 ? (
                  <Select
                    onValueChange={(v) => {
                      const bank = banks.find((b) => b.code === v);
                      setValue("bankCode", v, { shouldValidate: true });
                      setValue("bankName", bank?.name ?? "", { shouldValidate: true });
                    }}
                    value={watch("bankCode") || undefined}
                  >
                    <SelectTrigger error={!!errors.bankName}>
                      <SelectValue placeholder="Select your bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Enter your bank name"
                    error={!!errors.bankName}
                    {...register("bankName", {
                      onChange: (e) => setValue("bankCode", e.target.value.toUpperCase().replace(/\s+/g, "_").slice(0, 12))
                    })}
                  />
                )}
              </FormField>

              <FormField label="Account Number" error={errors.accountNumber?.message}>
                <Input
                  placeholder="0000000000"
                  error={!!errors.accountNumber}
                  {...register("accountNumber")}
                />
              </FormField>

              <FormField label="Account Name" error={errors.accountName?.message}>
                <Input
                  placeholder="e.g. John Doe"
                  error={!!errors.accountName}
                  {...register("accountName")}
                />
              </FormField>

              <div className="flex gap-3 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" size="lg" className="px-8" onClick={() => router.back()}>Back</Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  size="lg" 
                  className="flex-1"
                  loading={saveMutation.isPending || isNavigating}
                >
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
