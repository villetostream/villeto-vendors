"use client";

import { useEffect } from "react";
import { Bell, ChevronDown, Calendar, Menu } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useOrg } from "@/lib/hooks/useOrg";
import { useQuery } from "@tanstack/react-query";
import { getVendorOrganizations } from "@/lib/api/vendor";
import { queryKeys } from "@/lib/stores/orgStore";
import { cn, getInitials } from "@/lib/utils";

interface TopBarProps {
  /** Opens the mobile navigation drawer. Only the menu button uses this. */
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { activeOrg, organizations, setOrganizations, switchOrg } = useOrg();

  // Fetch org list once
  const { data: orgs } = useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: getVendorOrganizations,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (orgs) setOrganizations(orgs);
  }, [orgs, setOrganizations]);

  const dateRange = `Sep 25, 2025 - Oct 13, 2025`; // INTEGRATION POINT: from user preferences

  return (
    <div className="h-14 border-b border-dashboard-border bg-white flex items-center justify-between px-3 sm:px-6 sticky top-0 z-20 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile menu trigger — hidden at lg and above, where the sidebar is always visible */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <Menu className="h-5 w-5 text-foreground" aria-hidden="true" />
        </button>

        {/* Org switcher */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-sm font-medium min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-none">
                {activeOrg?.name ?? "Select Organisation"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-white shadow-lg p-1 animate-in fade-in-0 zoom-in-95"
              sideOffset={6}
            >
              {organizations.map((org) => (
                <DropdownMenu.Item
                  key={org.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer outline-none transition-colors",
                    org.id === activeOrg?.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  )}
                  onSelect={() => switchOrg(org.id)}
                >
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {getInitials(org.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{org.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{org.role}</p>
                  </div>
                  {org.id === activeOrg?.id && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Notification bell */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        {/* Date range — collapses to an icon-only button on small screens */}
        <button
          type="button"
          aria-label={`Date range: ${dateRange}`}
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
        >
          <Calendar className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
          <span className="hidden sm:inline">{dateRange}</span>
          <ChevronDown className="h-3.5 w-3.5 hidden sm:inline" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
