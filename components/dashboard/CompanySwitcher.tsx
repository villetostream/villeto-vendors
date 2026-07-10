"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { getVendorCompanies } from "@/lib/api/vendor";
import { useCompany } from "@/lib/hooks/useCompany";
import { queryKeys } from "@/lib/stores/companyStore";
import { cn, getCompanyStatusConfig, getInitials } from "@/lib/utils";

/**
 * Deliberately always renders the active company name inline (never just
 * an icon or a generic "Companies" label) — per the product requirement
 * that a vendor must always be sure which company they're currently
 * working with, this is the one thing on the page that should be
 * impossible to miss.
 */
export function CompanySwitcher() {
  const { companies, activeCompanyId, activeCompany, switchCompany, setCompanies } = useCompany();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.companies(),
    queryFn: getVendorCompanies,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (data) setCompanies(data);
  }, [data, setCompanies]);

  const handleSwitch = async (vendorId: string, companyId: string) => {
    if (companyId === activeCompanyId || switchingTo) return;
    setSwitchingTo(vendorId);
    try {
      await switchCompany(vendorId);
    } finally {
      setSwitchingTo(null);
    }
  };

  const activeStatusConfig = activeCompany
    ? getCompanyStatusConfig(activeCompany.status, activeCompany.approvalStatus)
    : null;

  // Single-company vendors don't need a dropdown affordance at all — just
  // show the name + status plainly, no chevron implying there's a choice.
  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border text-sm font-medium min-w-0">
        <span className="truncate max-w-[140px] sm:max-w-none">
          {activeCompany?.companyName ?? "—"}
        </span>
        {activeStatusConfig && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", activeStatusConfig.color, activeStatusConfig.bg)}>
            {activeStatusConfig.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-sm font-medium min-w-0"
          aria-label="Switch company"
        >
          <span className="truncate max-w-[120px] sm:max-w-none">
            {activeCompany?.companyName ?? "Select company"}
          </span>
          {activeStatusConfig && (
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", activeStatusConfig.color, activeStatusConfig.bg)}>
              {activeStatusConfig.label}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[260px] overflow-hidden rounded-xl border border-border bg-white shadow-lg p-1 animate-in fade-in-0 zoom-in-95"
          sideOffset={6}
        >
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            Currently working with
          </div>
          {companies.map((company) => {
            const isActive = company.companyId === activeCompanyId;
            const statusConfig = getCompanyStatusConfig(company.status, company.approvalStatus);
            const isSwitching = switchingTo === company.vendorId;

            return (
              <DropdownMenu.Item
                key={company.vendorId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer outline-none transition-colors",
                  isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  handleSwitch(company.vendorId, company.companyId);
                }}
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {getInitials(company.companyName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{company.companyName}</p>
                  <span className={cn("inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5", statusConfig.color, statusConfig.bg)}>
                    {statusConfig.label}
                  </span>
                </div>
                {isSwitching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                ) : isActive ? (
                  <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
