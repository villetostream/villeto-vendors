"use client";

import { useState } from "react";
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  return (
    <aside className="flex flex-col w-[210px] shrink-0 h-screen bg-white border-r border-dashboard-border sticky top-0">
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
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-dashboard-hover hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", isActive ? "text-primary" : "")} size={18} />
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
              <Image src={user.avatar_url} alt="" width={32} height={32} className="h-full w-full object-cover" />
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
          <LogOut size={18} />
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
  );
}
