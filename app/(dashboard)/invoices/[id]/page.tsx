"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceStatusBadge, InvoicePaymentStatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Modal";
import { useInvoice, useDeleteInvoice } from "@/lib/hooks/useInvoices";
import { formatDate, formatDateTime, formatCurrency, cn } from "@/lib/utils";
import { InvoiceStatus } from "@/lib/types";

const WORKFLOW_STEPS: { key: InvoiceStatus; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

function getWorkflowIndex(status: InvoiceStatus): number {
  const map: Record<InvoiceStatus, number> = {
    submitted: 0,
    under_review: 1,
    approved: 2,
    rejected: 1, // rejected branches off after review, not a further step
    paid: 3,
  };
  return map[status] ?? 0;
}

function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
        <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
  const deleteInvoice = useDeleteInvoice();

  if (isLoading) return <InvoiceDetailSkeleton />;

  if (isError) {
    return <ErrorState message="Couldn't load this invoice. Please try again." onRetry={() => refetch()} />;
  }

  if (!invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        description="This invoice may have been removed, or you may not have access to it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices">Back to invoices</Link>
          </Button>
        }
      />
    );
  }

  const workflowIdx = getWorkflowIndex(invoice.status);
  // Backend only allows edit/delete while status === "submitted" — see
  // lib/api/invoices.ts comments.
  const canEditOrDelete = invoice.status === "submitted";

  const handleDelete = async () => {
    try {
      await deleteInvoice.mutateAsync(invoice.vendorInvoiceId);
      router.push("/invoices");
    } catch {
      // useDeleteInvoice's onError already toasts; keep the dialog open
      // so the vendor can retry instead of being dropped back to the list.
    }
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold">{invoice.invoiceNumber}</h1>
                <InvoiceStatusBadge status={invoice.status} />
                <InvoicePaymentStatusBadge status={invoice.paymentStatus} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invoice.submittedAt ? `Sent on ${formatDate(invoice.submittedAt)}` : `Invoice date ${formatDate(invoice.invoiceDate)}`}
              </p>
            </div>
          </div>

          {canEditOrDelete && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push(`/invoices/${invoice.vendorInvoiceId}/edit`)}>
                <Edit className="h-4 w-4" aria-hidden="true" />
                Edit Invoice
              </Button>
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {invoice.status === "rejected" && (
          <div className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            This invoice was rejected.
          </div>
        )}
        {invoice.accountingSyncError && (
          <div className="text-xs text-amber-700 font-medium bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Accounting sync issue: {invoice.accountingSyncError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-dashboard-border p-6">
              <h2 className="text-base font-semibold mb-4">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 border-t border-border pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Related PO</p>
                  <p className="text-sm font-semibold mt-0.5">{invoice.poNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-sm font-semibold mt-0.5">{formatCurrency(invoice.totalAmount, invoice.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="text-sm font-semibold mt-0.5">{formatDate(invoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivery Date</p>
                  <p className="text-sm font-semibold mt-0.5">{formatDate(invoice.deliveryDate)}</p>
                </div>
              </div>
              {invoice.notes && (
                <div className="pt-4 mt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm mt-0.5">{invoice.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">
                  Invoice Items <span className="text-muted-foreground font-normal">{invoice.lineItems.length}</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Quantity", "Unit Price", "Tax", "Total"].map((col) => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item) => (
                      <tr key={item.vendorInvoiceLineItemId} className="border-b border-border/60">
                        <td className="px-6 py-3.5 text-sm font-medium">{item.name}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{item.quantity}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{formatCurrency(item.taxAmount, invoice.currency)}</td>
                        <td className="px-6 py-3.5 text-sm font-medium">{formatCurrency(item.lineTotal, invoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={4} className="px-6 py-3.5 text-sm font-semibold text-right text-muted-foreground">
                        Total Amount
                      </td>
                      <td className="px-6 py-3.5 text-sm font-bold text-foreground">
                        {formatCurrency(invoice.totalAmount, invoice.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-dashboard-border p-5 h-fit">
            <h3 className="text-sm font-semibold mb-4">Invoice Status</h3>
            {invoice.status === "rejected" ? (
              <p className="text-sm text-red-600 font-medium">Rejected during review.</p>
            ) : (
              <div className="space-y-0">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const isCompleted = idx <= workflowIdx;
                  const isLast = idx === WORKFLOW_STEPS.length - 1;
                  const timestamps: Partial<Record<InvoiceStatus, string | undefined>> = {
                    submitted: invoice.submittedAt,
                    under_review: invoice.underReviewAt,
                    approved: invoice.approvedAt,
                    paid: invoice.paidAt,
                  };

                  return (
                    <div key={step.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                            isCompleted ? "border-primary bg-primary" : "border-border bg-white"
                          )}
                        >
                          {isCompleted && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                        {!isLast && (
                          <div className={cn("w-0.5 my-1", isCompleted ? "bg-primary" : "bg-border")} style={{ minHeight: 24 }} />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className={cn("text-sm font-medium", isCompleted ? "text-foreground" : "text-muted-foreground")}>
                          {step.label}
                        </p>
                        {timestamps[step.key] && (
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(timestamps[step.key])}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={(o) => !o && setShowDeleteConfirm(false)}>
        <DialogContent size="sm">
          <DialogTitle>Delete Invoice</DialogTitle>
          <DialogDescription className="mt-1.5">
            Are you sure you want to delete <strong>{invoice.invoiceNumber}</strong>? This action cannot be undone.
          </DialogDescription>
          <div className="flex gap-3 mt-5">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" loading={deleteInvoice.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
