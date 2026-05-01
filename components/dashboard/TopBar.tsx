"use client";

import { useEffect } from "react";
import { Bell, ChevronDown, Calendar } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useOrg } from "@/lib/hooks/useOrg";
import { useQuery } from "@tanstack/react-query";
import { getVendorOrganizations } from "@/lib/api/vendor";
import { queryKeys } from "@/lib/stores/orgStore";
import { cn, getInitials } from "@/lib/utils";

export function TopBar() {
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
    <div className="h-14 border-b border-dashboard-border bg-white flex items-center justify-between px-6 sticky top-0 z-20">
      {/* Org switcher */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-sm font-medium">
            {activeOrg?.name ?? "Select Organisation"}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative p-2 rounded-xl hover:bg-muted transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        {/* Date range */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-red-400" />
          {dateRange}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
