"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, FilePlus2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "@/lib/api/invoices";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { PageSpinner, EmptyState } from "@/components/ui/Spinner";
import { InvoiceActionMenu } from "@/components/invoices/InvoiceActionMenu";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { InvoiceStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All Invoices", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "In-Progress", value: "under_review" },
  { label: "Paid", value: "paid" },
  { label: "Flagged", value: "flagged" },
  { label: "Draft", value: "draft" },
];

export default function InvoicesPage() {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";
  const [activeTab, setActiveTab] = useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    search: search || undefined,
    page,
    per_page: perPage,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.invoices(orgId, filters),
    queryFn: () => getInvoices(filters),
    enabled: !!orgId,
    placeholderData: { data: MOCK_INVOICES, total: MOCK_INVOICES.length, page: 1, per_page: perPage, total_pages: 1 },
  });

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold px-2">
              {total}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and track your purchase orders from{" "}
            <strong>Global Logistics Corp</strong>.
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/invoices/create">
            <FilePlus2 className="h-4 w-4" />
            Create new Invoice
          </Link>
        </Button>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        {/* Tabs + Search */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 border-b border-dashboard-border gap-4">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setActiveTab(tab.value); setPage(1); }}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  activeTab === tab.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-44"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-10"><PageSpinner /></div>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description="Invoices you create will appear here."
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/invoices/create">Create Invoice</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {["Invoice Number", "Related PO", "Amount", "Submission Date", "Status", "ACTION"].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-left text-xs font-medium text-muted-foreground"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {invoice.related_po ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {invoice.submission_date
                        ? formatDate(invoice.submission_date)
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <InvoiceActionMenu
                        invoiceId={invoice.id}
                        invoiceNumber={invoice.invoice_number}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-dashboard-border">
          <p className="text-sm text-muted-foreground">
            Showing 1-{Math.min(perPage, invoices.length)} of {total} entries
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "h-8 w-8 text-sm rounded-lg border transition-colors",
                  p === page
                    ? "border-primary bg-primary text-white"
                    : "border-border hover:bg-muted"
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCK_INVOICES = [
  { id: "1", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: undefined, status: "draft" as const, payment_status: "pending" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "2", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "flagged" as const, payment_status: "pending" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "3", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: undefined, status: "pending" as const, payment_status: "pending" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "4", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "draft" as const, payment_status: "pending" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "5", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "under_review" as const, payment_status: "in_progress" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "6", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "pending" as const, payment_status: "pending" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "7", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "under_review" as const, payment_status: "in_progress" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "8", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "paid" as const, payment_status: "paid" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "9", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "paid" as const, payment_status: "paid" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
  { id: "10", invoice_number: "In-234-53", related_po: "PO-2024-001", amount: 200000, submission_date: "2025-09-26", status: "paid" as const, payment_status: "paid" as const, organization: "ABC Enterprise", org_id: "org1", tax_rate: 0, subtotal: 200000, total_amount: 200000, items: [], workflow: [] },
];
