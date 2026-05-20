import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { ApprovalGuard } from "@/components/shared/ApprovalGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApprovalGuard>
      <div className="flex h-screen bg-dashboard-bg overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 page-enter">{children}</div>
          </main>
        </div>
      </div>
    </ApprovalGuard>
  );
}
