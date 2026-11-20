"use client";

import { Menu } from "lucide-react";
import { CompanySwitcher } from "@/components/dashboard/CompanySwitcher";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { cn } from "@/lib/utils";

interface TopBarProps {
  /** Opens the mobile navigation drawer. Only the menu button uses this. */
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const dateRange = useCompanyStore((state) => state.dateRange);
  const setDateRange = useCompanyStore((state) => state.setDateRange);
  const isCollapsed = useSidebarStore((state) => state.isCollapsed);

  return (
    <div
      className={cn(
        "h-16 border-b border-dashboard-border bg-white flex items-center justify-between sticky top-0 z-20 gap-2 transition-all",
        isCollapsed ? "px-3 sm:pl-8 sm:pr-6" : "px-3 sm:px-6"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile menu trigger — hidden at lg and above, where the sidebar is always visible */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-muted transition-colors shrink-0 cursor-pointer"
        >
          <Menu className="h-5 w-5 text-foreground" aria-hidden="true" />
        </button>

        <CompanySwitcher />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <NotificationBell />

        <DateRangePicker 
          date={dateRange} 
          onSelect={(range) => setDateRange(range)} 
        />
      </div>
    </div>
  );
}
