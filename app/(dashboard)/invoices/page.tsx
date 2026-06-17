"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, FilePlus2 } from "lucide-react";
import { useDebounce } from "use-debounce";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { useOrgStore } from "@/lib/stores/orgStore";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
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

const INVOICES_COLUMNS = ["Invoice Number", "Related PO", "Amount", "Submission Date", "Status", "Action"];

export default function InvoicesPage() {
  const activeOrg = useOrgStore((s) => s.activeOrg);
  const [activeTab, setActiveTab] = useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch]);

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    search: debouncedSearch || undefined,
    page,
    per_page: perPage,
  };

  const { data, isLoading, isError, refetch, isFetching } = useInvoices(filters);

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold px-2">
              {total}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and track your invoices for{" "}
            <strong>{activeOrg?.name ?? "your organisation"}</strong>.
          </p>
        </div>
        <Button asChild variant="primary" className="self-start sm:self-auto">
          <Link href="/invoices/create">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Create new Invoice
          </Link>
        </Button>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
        {/* Tabs + Search */}
        <div className="flex flex-col gap-3 px-5 pt-4 pb-3 border-b border-dashboard-border sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-0">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                aria-current={activeTab === tab.value ? "true" : undefined}
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="invoice-search" className="sr-only">Search invoices</label>
              <input
                id="invoice-search"
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-44"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <TableSkeleton rows={perPage} columns={INVOICES_COLUMNS.length} />
        ) : isError ? (
          <ErrorState
            message="Couldn't load invoices. Please check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : invoices.length === 0 ? (
          <EmptyState
            title={debouncedSearch || activeTab !== "all" ? "No matching invoices" : "No invoices yet"}
            description={
              debouncedSearch || activeTab !== "all"
                ? "Try adjusting your search or filter."
                : "Invoices you create will appear here."
            }
            action={
              !debouncedSearch && activeTab === "all" ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/invoices/create">Create Invoice</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-dashboard-border">
                  {INVOICES_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground whitespace-nowrap">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {invoice.related_po ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
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
        {!isLoading && !isError && invoices.length > 0 && (
          <div className="flex flex-col gap-3 px-5 py-3.5 border-t border-dashboard-border sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total} entries
            </p>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
