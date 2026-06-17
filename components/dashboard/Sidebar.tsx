"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, FileText, User, LogOut,
} from "lucide-react";
import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { useAuthStore } from "@/lib/stores/authStore";
import { logout } from "@/lib/api/auth";
import { cn, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

import Image from "next/image";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/invoices", label: "Invoices", icon: FileText },
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
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      clearAuth();
      router.push("/auth/login");
    } catch {
      toast.error("Logout failed");
      setIsLoggingOut(false);
    }
  };

  const handleNavClick = () => {
    // On mobile, tapping a nav link should also close the drawer.
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
          "flex flex-col w-[210px] shrink-0 h-screen bg-white border-r border-dashboard-border",
          // Desktop: always visible, part of the flex layout.
          "lg:sticky lg:top-0 lg:translate-x-0",
          // Mobile: fixed overlay drawer that slides in/out.
          "fixed top-0 left-0 z-50 transition-transform duration-200 ease-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-dashboard-border">
          <VilletoLogo size="sm" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);

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
                <Icon className={cn("h-4.5 w-4.5", isActive ? "text-primary" : "")} size={18} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="p-3 border-t border-dashboard-border space-y-1">
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
            onClick={() => setLogoutModalOpen(true)}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>

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
