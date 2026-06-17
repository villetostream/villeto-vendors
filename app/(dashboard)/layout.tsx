import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ApprovalGuard } from "@/components/shared/ApprovalGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApprovalGuard>
      <DashboardShell>{children}</DashboardShell>
    </ApprovalGuard>
  );
}
