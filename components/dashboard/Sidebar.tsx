"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  User,
  LogOut,
  Building2,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { useAuthStore } from "@/lib/stores/authStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { logout } from "@/lib/api/auth";
import { cn, getInitials } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import Image from "next/image";
import { useMyCompanies } from "@/lib/hooks/useVendorNetwork";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/companies", label: "Organizations", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

interface SidebarProps {
  /** Whether the mobile drawer is open. Ignored at `lg` and above, where the sidebar is always visible. */
  isMobileOpen?: boolean;
  /** Called when the drawer should close (backdrop click, Escape key, nav link tap, close button). */
  onMobileClose?: () => void;
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { isCollapsed, toggleSidebar } = useSidebarStore();

  const { data: companiesData } = useMyCompanies({});
  const companies = companiesData?.data || [];
  const pendingInvitationsCount = companies.filter(
    (c: any) => c.nextAction === "accept_invitation"
  ).length;

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // Close the mobile drawer on Escape for keyboard users.
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!isMobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout API failed:", error);
    } finally {
      clearAuth();
      queryClient.clear();
      window.location.replace("/auth/login");
    }
  };

  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        role={isMobileOpen ? "dialog" : undefined}
        aria-modal={isMobileOpen ? true : undefined}
        aria-label="Main navigation"
        className={cn(
          "flex flex-col shrink-0 bg-white border-r border-dashboard-border transition-all duration-200 ease-in-out relative",
          // Desktop: width toggles between 210px and 68px
          isCollapsed ? "lg:w-[68px]" : "lg:w-[210px]",
          "lg:static lg:h-full lg:z-30 lg:translate-x-0",
          // Mobile: fixed overlay drawer that slides in/out (always 210px on mobile)
          "w-[210px] fixed inset-y-0 left-0 z-50",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Floating toggle button centered on the divider line (Notion / Linear style) */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
                className="hidden lg:flex absolute -right-3 top-5 z-40 size-6 items-center justify-center rounded-full bg-white border border-dashboard-border shadow-xs hover:bg-dashboard-hover hover:border-slate-300 transition-all text-primary cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs font-medium">
                {isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Logo Header */}
        <div
          className={cn(
            "border-b border-dashboard-border h-16 shrink-0 flex items-center transition-all",
            isCollapsed ? "px-2 justify-center" : "px-4"
          )}
        >
          {isCollapsed ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/dashboard"
                    className="flex items-center justify-center p-2 rounded-xl hover:bg-dashboard-hover transition-colors"
                  >
                    <Image
                      src="/images/villeto-logo-v.png"
                      alt="Villeto"
                      width={28}
                      height={25}
                      className="object-contain"
                      priority
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs font-medium">Villeto Dashboard</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Link href="/dashboard" className="flex items-center">
              <VilletoLogo size="sm" />
            </Link>
          )}
        </div>

        {/* Nav Items */}
        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto",
            isCollapsed ? "p-2" : "p-3 space-y-0.5"
          )}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);

            if (isCollapsed) {
              return (
                <TooltipProvider key={href} delayDuration={50}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        onClick={handleNavClick}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "relative flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-dashboard-hover hover:text-foreground"
                        )}
                      >
                        <Icon
                          className={cn("h-5 w-5", isActive ? "text-primary" : "")}
                          aria-hidden="true"
                        />
                        {href === "/companies" && pendingInvitationsCount > 0 && (
                          <span className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-500 h-4 min-w-[16px] px-1 text-[9px] font-bold text-white shadow-xs">
                            {pendingInvitationsCount}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12} className="font-medium text-xs">
                      <span>{label}</span>
                      {href === "/companies" && pendingInvitationsCount > 0 && (
                        <span className="ml-1.5 text-red-500 font-bold">
                          ({pendingInvitationsCount})
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                onClick={handleNavClick}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-dashboard-hover hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("h-4.5 w-4.5", isActive ? "text-primary" : "")}
                  size={18}
                  aria-hidden="true"
                />
                <span className="flex-1 text-left">{label}</span>
                {href === "/companies" && pendingInvitationsCount > 0 && (
                  <span className="ml-auto flex items-center justify-center rounded-full bg-red-500 h-5 min-w-[20px] px-1 text-[10px] font-bold text-white">
                    {pendingInvitationsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        {isCollapsed ? (
          <div className="p-2 border-t border-dashboard-border flex flex-col items-center gap-2 shrink-0">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 overflow-hidden cursor-default">
                    {user?.avatar_url ? (
                      <Image
                        src={user.avatar_url}
                        alt={user?.business_name ? `${user.business_name} logo` : "Business avatar"}
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(user?.business_name ?? "V")
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12} className="max-w-xs text-left">
                  <p className="font-semibold text-xs text-foreground truncate">
                    {user?.business_name ?? "Business name"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {user?.email ?? "email@example.com"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setLogoutModalOpen(true)}
                    aria-label="Sign out"
                    className="flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                  >
                    <LogOut size={18} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  <p className="text-xs">Sign out</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="p-3 border-t border-dashboard-border space-y-1 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 overflow-hidden">
                {user?.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user?.business_name ? `${user.business_name} logo` : "Business avatar"}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(user?.business_name ?? "V")
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {user?.business_name ?? "Business name"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email ?? "email@example.com"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLogoutModalOpen(true)}
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
            >
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}

        <Dialog open={logoutModalOpen} onOpenChange={setLogoutModalOpen}>
          <DialogContent size="sm">
            <DialogTitle className="mb-2">Sign out</DialogTitle>
            <DialogDescription className="mb-6">
              Are you sure you want to sign out of your account?
            </DialogDescription>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setLogoutModalOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600 border-none"
                onClick={handleLogout}
                loading={isLoggingOut}
              >
                Sign out
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </aside>
    </>
  );
}
