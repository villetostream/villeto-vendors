"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { MessagingWidget } from "@/components/messaging/MessagingWidget";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="fixed inset-0 flex w-full h-full bg-dashboard-bg overflow-hidden">
      <Sidebar
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <TopBar onMenuClick={() => setIsMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 page-enter">{children}</div>
        </main>
      </div>
      <MessagingWidget />
    </div>
  );
}
