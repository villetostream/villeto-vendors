"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FilePlus2, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "use-debounce";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { useCompany } from "@/lib/hooks/useCompany";
import { InvoiceStatusBadge, InvoicePaymentStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/Spinner";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { InvoiceActionMenu } from "@/components/invoices/InvoiceActionMenu";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { InvoiceStatus } from "@/lib/types";

const STATUS_TABS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All Invoices", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "Under Review", value: "under_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Paid", value: "paid" },
];

const INVOICES_COLUMNS = ["Invoice Number", "Related PO", "Amount", "Invoice Date", "Status", "Payment", "Action"];

const LIMIT = 10;

export default function InvoicesPage() {
  const router = useRouter();
  const { activeCompany } = useCompany();
  const [activeTab, setActiveTab] = useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 400);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch]);

  const filters = {
    status: activeTab === "all" ? undefined : activeTab,
    page,
    limit: LIMIT,
  };

  const { data, isLoading, isError, refetch, isFetching } = useInvoices(filters);

  const invoices = data ?? [];
  // No total count from the list endpoint yet — see orders/page.tsx note.
  const hasNextPage = invoices.length === LIMIT;

  const visibleInvoices = debouncedSearch
    ? invoices.filter((inv) => inv.invoiceNumber.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : invoices;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and track your invoices for{" "}
            <strong>{activeCompany?.companyName ?? "your company"}</strong>.
          </p>
        </div>
        <Button asChild variant="primary" className="self-start sm:self-auto">
          <Link href="/invoices/create">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Create new Invoice
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
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
              <label htmlFor="invoice-search" className="sr-only">Search invoices on this page</label>
              <input
                id="invoice-search"
                type="text"
                placeholder="Search this page..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={LIMIT} columns={INVOICES_COLUMNS.length} />
        ) : isError ? (
          <ErrorState message="Couldn't load invoices. Please check your connection and try again." onRetry={() => refetch()} />
        ) : visibleInvoices.length === 0 ? (
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
                    <th key={col} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((invoice) => (
                  <tr 
                    key={invoice.vendorInvoiceId} 
                    onClick={() => router.push(`/invoices/${invoice.vendorInvoiceId}`)}
                    className="border-b border-dashboard-border/60 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-foreground whitespace-nowrap">{invoice.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{invoice.poNumber ?? "—"}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                      {formatCurrency(invoice.totalAmount, invoice.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(invoice.invoiceDate)}</td>
                    <td className="px-5 py-3.5"><InvoiceStatusBadge status={invoice.status} /></td>
                    <td className="px-5 py-3.5"><InvoicePaymentStatusBadge status={invoice.paymentStatus} /></td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <InvoiceActionMenu
                        invoiceId={invoice.vendorInvoiceId}
                        invoiceNumber={invoice.invoiceNumber}
                        status={invoice.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && invoices.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-dashboard-border">
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                aria-label="Next page"
                className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
