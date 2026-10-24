"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Clock, Check, Sparkles, AlertCircle, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { CompanyPaymentTermOption, VendorPaymentTermSubmission } from "@/lib/types";
import { PageSpinner } from "@/components/ui/Spinner";

export const PAYMENT_ARRANGEMENTS = [
  "Payment within a specified number of days",
  "Payment upon delivery",
  "Specify terms per invoice (Dynamic)",
] as const;

export type PaymentArrangement = (typeof PAYMENT_ARRANGEMENTS)[number];

export const PAYMENT_PERIODS = [
  "Net 7 days",
  "Net 15 days",
  "Net 30 days",
  "Net 45 days",
  "Net 60 days",
  "Other",
] as const;

export type PaymentPeriod = (typeof PAYMENT_PERIODS)[number];

export interface PaymentTermsValues {
  optionId?: string;
  reusePaymentTermId?: string;
  name?: string;
  days?: number;
  arrangement?: string;
  period?: string;
  customPeriod?: string;
  advancePercentage?: number;
  isDynamic?: boolean;
  notes?: string;
}

interface PaymentTermsFormProps {
  options?: CompanyPaymentTermOption[];
  savedSubmissions?: VendorPaymentTermSubmission[];
  initialValues?: Partial<PaymentTermsValues> | null;
  onContinue: (values: PaymentTermsValues) => void;
  onBack: () => void;
  isLoading?: boolean;
  isLoadingOptions?: boolean;
  /** When set, shows a rejection-reason banner and changes the CTA to Resubmit */
  rejectionReason?: string | null;
  /** When true, the form is in resubmit mode (payment terms were rejected) */
  isResubmit?: boolean;
  /** When true, the form is locked in read-only mode because onboarding has already been approved */
  readOnly?: boolean;
}

export function PaymentTermsForm({
  options = [],
  savedSubmissions = [],
  initialValues,
  onContinue,
  onBack,
  isLoading = false,
  isLoadingOptions = false,
  rejectionReason,
  isResubmit = false,
  readOnly = false,
}: PaymentTermsFormProps) {
  // Selected mode when saved submissions exist
  const [mode, setMode] = useState<"options" | "reuse">("options");
  const [selectedReuseId, setSelectedReuseId] = useState<string>(
    initialValues?.reusePaymentTermId || savedSubmissions[0]?.paymentTermId || ""
  );

  const initialArrangement = useMemo(() => {
    const raw = (initialValues?.arrangement || initialValues?.name || "").toLowerCase();
    if (
      initialValues?.isDynamic ||
      raw.includes("invoice") ||
      raw.includes("dynamic") ||
      raw.includes("custom")
    ) {
      return "Specify terms per invoice (Dynamic)";
    }
    if (
      raw.includes("delivery") ||
      raw.includes("receipt") ||
      (initialValues?.days === 0 && !initialValues?.period)
    ) {
      return "Payment upon delivery";
    }
    return "Payment within a specified number of days";
  }, [initialValues]);

  const initialPeriod = useMemo(() => {
    if (initialValues?.customPeriod || initialValues?.period === "Other") {
      return "Other";
    }
    if (initialValues?.period && PAYMENT_PERIODS.includes(initialValues.period as any)) {
      return initialValues.period;
    }
    if (initialValues?.days !== undefined && initialValues.days > 0) {
      const match = PAYMENT_PERIODS.find((p) => p.includes(`${initialValues.days} days`));
      if (match) return match;
      return "Other";
    }
    return "Net 7 days";
  }, [initialValues]);

  const [arrangement, setArrangement] = useState<string>(initialArrangement);
  const [period, setPeriod] = useState<string>(initialPeriod);
  const [legacyCustomPeriod, setLegacyCustomPeriod] = useState<string>(
    initialValues?.customPeriod ||
      (initialValues?.period === "Other" ||
      (initialValues?.days !== undefined &&
        initialValues.days > 0 &&
        !PAYMENT_PERIODS.some((p) => p.includes(`${initialValues?.days} days`)))
        ? initialValues?.name || (initialValues?.days ? `Net ${initialValues.days} days` : "")
        : "")
  );
  const [notes, setNotes] = useState<string>(initialValues?.notes || "");

  // Sync state if initialValues changes
  useEffect(() => {
    if (initialValues?.arrangement) {
      setArrangement(initialArrangement);
    }
    if (initialValues?.period) {
      setPeriod(initialPeriod);
    }
  }, [initialValues, initialArrangement, initialPeriod]);

  const handleContinue = () => {
    // 0. Reuse mode
    if (mode === "reuse" && selectedReuseId) {
      const reused = savedSubmissions.find((s) => s.paymentTermId === selectedReuseId);
      onContinue({
        reusePaymentTermId: selectedReuseId,
        name: reused?.name,
        days: reused?.days,
        arrangement: reused?.name,
        notes: notes.trim(),
      });
      return;
    }

    // 1. Payment upon delivery (0 days / immediate)
    // Uses the 0-days option from the options endpoint, sending its optionId
    if (arrangement === "Payment upon delivery") {
      const zeroOpt =
        options?.find((o) => o.days === 0) ||
        options?.find(
          (o) =>
            o.name?.toLowerCase().includes("receipt") ||
            o.name?.toLowerCase().includes("delivery")
        );

      onContinue({
        optionId: zeroOpt?.vendorPaymentTermOptionId,
        name: zeroOpt?.name || "Payment upon delivery",
        days: 0,
        arrangement: "Payment upon delivery",
        period: "Due on receipt",
        notes: notes.trim(),
      });
      return;
    }

    // 2. Payment within a specified number of days
    if (arrangement === "Payment within a specified number of days") {
      if (period === "Other") {
        // "Other" creates a new custom term without optionId
        const daysNum = Math.max(1, parseInt(legacyCustomPeriod.replace(/\D/g, ""), 10) || 30);
        const customName = legacyCustomPeriod.trim() || `Net ${daysNum} days`;
        onContinue({
          // Strictly NO optionId — instructs backend to create new custom term
          name: customName,
          days: daysNum,
          arrangement: "Payment within a specified number of days",
          period: "Other",
          customPeriod: customName,
          notes: notes.trim(),
        });
        return;
      }

      // Preset periods (Net 7, Net 15, Net 30, Net 45, Net 60)
      // Match option from endpoint with remaining dates to send its optionId
      const daysNum = parseInt(period.replace(/\D/g, ""), 10) || 30;
      const matchingOpt =
        options?.find((o) => o.days === daysNum) ||
        options?.find((o) => o.name?.toLowerCase().includes(`${daysNum} day`));

      onContinue({
        optionId: matchingOpt?.vendorPaymentTermOptionId,
        name: period,
        days: daysNum,
        arrangement: "Payment within a specified number of days",
        period,
        notes: notes.trim(),
      });
      return;
    }

    // 3. Specify terms per invoice (Dynamic)
    // Allows vendors to set preferred terms per invoice rather than fixed onboarding terms
    if (
      arrangement === "Specify terms per invoice (Dynamic)" ||
      arrangement === "Other/custom arrangement"
    ) {
      onContinue({
        name: "Specify terms per invoice",
        days: 0,
        arrangement: "Specify terms per invoice (Dynamic)",
        isDynamic: true,
        notes: notes.trim(),
      });
      return;
    }

    // Fallback
    onContinue({
      name: arrangement,
      days: 0,
      arrangement,
      notes: notes.trim(),
    });
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            {isResubmit ? "Resubmit Payment Terms" : "Payment Terms"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isResubmit
              ? "Modify your payment terms and resubmit for the organization's review."
              : "What is your preferred payment terms?"}
          </p>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-6 space-y-6">
          {/* Rejection reason banner */}
          {isResubmit && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-rose-900">Payment Terms Rejected</h3>
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  {rejectionReason ||
                    "The organization has rejected your payment terms. Please modify them and resubmit."}
                </p>
              </div>
            </div>
          )}

          {isLoadingOptions ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <PageSpinner />
              <p className="text-xs text-muted-foreground">
                Loading payment term options...
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Optional reuse banner if vendor has other active payment terms */}
              {savedSubmissions.length > 0 && !readOnly && (
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setMode("options")}
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                      mode === "options"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Configure Terms
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("reuse")}
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                      mode === "reuse"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Reuse Previous ({savedSubmissions.length})
                  </button>
                </div>
              )}

              {mode === "reuse" && savedSubmissions.length > 0 && !readOnly ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    Select a previously submitted payment term
                  </label>
                  <div className="space-y-2.5">
                    {savedSubmissions.map((sub) => {
                      const isSelected = selectedReuseId === sub.paymentTermId;
                      return (
                        <div
                          key={sub.paymentTermId}
                          onClick={() => setSelectedReuseId(sub.paymentTermId)}
                          className={cn(
                            "p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-border/70 hover:border-border hover:bg-slate-50/60"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                isSelected
                                  ? "border-primary bg-white"
                                  : "border-slate-300 bg-white"
                              )}
                            >
                              {isSelected && (
                                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {sub.name}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                  {sub.days === 0
                                    ? "Due on receipt"
                                    : `${sub.days} days`}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Used with {sub.companyName}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {sub.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Primary Dropdown-based arrangement UI */
                <div className="space-y-6">
                  {/* Preferred payment arrangement select */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Preferred payment arrangement
                    </label>
                    <Select
                      value={arrangement}
                      onValueChange={(val) => !readOnly && setArrangement(val)}
                      disabled={readOnly}
                    >
                      <SelectTrigger className={cn("h-12 rounded-xl text-sm bg-white border border-border", readOnly && "opacity-90 cursor-default bg-slate-50/70")}>
                        <SelectValue placeholder="Select preferred payment arrangement" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border/60 shadow-lg p-1.5 bg-white">
                        {PAYMENT_ARRANGEMENTS.map((item) => (
                          <SelectItem
                            key={item}
                            value={item}
                            className="cursor-pointer"
                          >
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 1. Payment within a specified number of days */}
                  {arrangement === "Payment within a specified number of days" && (
                    <div className="space-y-3 pt-1">
                      <label className="block text-sm font-medium text-foreground">
                        Preferred payment period
                      </label>
                      <div className="space-y-3">
                        {PAYMENT_PERIODS.map((p) => {
                          const isSelected = period === p;
                          return (
                            <div
                              key={p}
                              onClick={() => !readOnly && setPeriod(p)}
                              className={cn(
                                "flex items-center gap-3 select-none",
                                readOnly ? "cursor-default opacity-85" : "cursor-pointer group"
                              )}
                            >
                              <div
                                className={cn(
                                  "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                  isSelected
                                    ? "border-primary bg-white"
                                    : "border-slate-300 bg-white group-hover:border-slate-400"
                                )}
                              >
                                {isSelected && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                                )}
                              </div>
                              <span className="text-sm text-foreground font-normal">
                                {p}
                              </span>
                            </div>
                          );
                        })}

                        {period === "Other" && (
                          <div className="pt-1 pl-8 max-w-sm">
                            <Input
                              placeholder="Specify custom payment period (e.g. Net 90 days)"
                              value={legacyCustomPeriod}
                              onChange={(e) => setLegacyCustomPeriod(e.target.value)}
                              disabled={readOnly}
                              className="h-10 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2. Payment upon delivery */}
                  {arrangement === "Payment upon delivery" && (
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                      <Truck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-900">
                          Payment Upon Delivery
                        </h4>
                        <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                          Invoices will be due immediately upon confirmed delivery of products or completion of services (0 days / Due on receipt).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 3. Specify terms per invoice (Dynamic) */}
                  {(arrangement === "Specify terms per invoice (Dynamic)" ||
                    arrangement === "Other/custom arrangement") && (
                    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/60 flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold text-teal-900">
                          Dynamic Terms (Set Per Invoice)
                        </h4>
                        <p className="text-xs text-teal-700 mt-0.5 leading-relaxed">
                          Instead of locking into a fixed payment schedule during onboarding, you will be prompted to specify the payment terms individually each time you generate an invoice.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Additional terms or notes (optional) */}
                  <div className="space-y-2 pt-2">
                    <label className="block text-sm font-medium text-foreground">
                      Additional terms or notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="E.g. Payment begins after delivery confirmation"
                      rows={3}
                      disabled={readOnly}
                      readOnly={readOnly}
                      className={cn(
                        "w-full rounded-xl border border-border/80 p-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all",
                        readOnly && "bg-slate-50/60 cursor-default opacity-90"
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-6"
              onClick={onBack}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="flex-1"
              loading={isLoading}
              onClick={handleContinue}
            >
              {readOnly ? (
                "Return to Overview"
              ) : isResubmit ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resubmit Terms
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
