"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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

export const PAYMENT_ARRANGEMENTS = [
  "Payment within a specified number of days",
  "Payment upon delivery",
  "Advance payment",
  "Milestone-based payments",
  "Other/custom arrangement",
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

const ADVANCE_MARKS = [0, 20, 40, 60, 80, 100];

export interface PaymentTermsValues {
  arrangement: string;
  period?: string;
  customPeriod?: string;
  advancePercentage?: number;
  notes?: string;
}

interface PaymentTermsFormProps {
  initialValues?: Partial<PaymentTermsValues> | null;
  onContinue: (values: PaymentTermsValues) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function PaymentTermsForm({
  initialValues,
  onContinue,
  onBack,
  isLoading = false,
}: PaymentTermsFormProps) {
  const [arrangement, setArrangement] = useState<string>(
    initialValues?.arrangement || "Payment within a specified number of days"
  );
  const [period, setPeriod] = useState<string>(
    initialValues?.period || "Net 7 days"
  );
  const [customPeriod, setCustomPeriod] = useState<string>(
    initialValues?.customPeriod || ""
  );
  const [advancePercentage, setAdvancePercentage] = useState<number>(
    initialValues?.advancePercentage ?? 20
  );
  const [notes, setNotes] = useState<string>(initialValues?.notes || "");

  const handleContinue = () => {
    onContinue({
      arrangement,
      period: arrangement === "Payment within a specified number of days" ? period : undefined,
      customPeriod:
        arrangement === "Payment within a specified number of days" && period === "Other"
          ? customPeriod
          : undefined,
      advancePercentage: arrangement === "Advance payment" ? advancePercentage : undefined,
      notes: notes.trim(),
    });
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Payment Terms
          </h2>
          <p className="text-sm text-muted-foreground">
            What is your preferred payment terms?
          </p>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-6">
          {/* Preferred payment arrangement */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Preferred payment arrangement
            </label>
            <Select value={arrangement} onValueChange={(val) => setArrangement(val)}>
              <SelectTrigger className="h-12 rounded-xl text-sm">
                <SelectValue placeholder="Select preferred payment arrangement" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/60 shadow-lg p-1.5">
                {PAYMENT_ARRANGEMENTS.map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                    className="py-2.5 px-3 rounded-lg text-sm font-normal cursor-pointer hover:bg-slate-50 focus:bg-slate-50"
                  >
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conditional 1: Payment within a specified number of days */}
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
                      onClick={() => setPeriod(p)}
                      className="flex items-center gap-3 cursor-pointer group select-none"
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
                      value={customPeriod}
                      onChange={(e) => setCustomPeriod(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conditional 2: Advance payment */}
          {arrangement === "Advance payment" && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-foreground">
                  Preferred advance payment:{" "}
                  <span className="text-primary font-semibold">
                    {advancePercentage}%
                  </span>
                </label>
              </div>

              {/* Step Slider Track */}
              <div className="relative w-full pt-4 pb-8 px-1">
                {/* Background Line */}
                <div className="relative h-1 w-full bg-slate-200 rounded-full">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={20}
                    value={advancePercentage}
                    onChange={(e) => setAdvancePercentage(Number(e.target.value))}
                    className="absolute -top-3 left-0 w-full h-7 opacity-0 cursor-pointer z-20"
                    aria-label="Preferred advance payment percentage"
                  />
                  {/* Active Teal Line */}
                  <div
                    className="absolute top-0 left-0 h-1 bg-primary rounded-full transition-all duration-150"
                    style={{ width: `${advancePercentage}%` }}
                  />

                  {/* Marks & Handles */}
                  {ADVANCE_MARKS.map((mark) => {
                    const isSelected = advancePercentage === mark;
                    return (
                      <div
                        key={mark}
                        onClick={() => setAdvancePercentage(mark)}
                        style={{ left: `${mark}%` }}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center cursor-pointer group z-30"
                      >
                        {isSelected ? (
                          <div className="h-5 w-5 rounded-full border-2 border-primary bg-white shadow-sm flex items-center justify-center transition-transform hover:scale-110" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-slate-300 transition-colors group-hover:bg-primary/50" />
                        )}

                        <span
                          className={cn(
                            "absolute top-5 text-xs font-normal whitespace-nowrap select-none transition-colors",
                            isSelected
                              ? "text-foreground font-semibold"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {mark}%
                        </span>
                      </div>
                    );
                  })}
                </div>
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
              rows={4}
              className="w-full rounded-xl border border-border/80 p-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8"
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
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
