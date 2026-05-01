"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, Download, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getInvoice } from "@/lib/api/invoices";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { Button } from "@/components/ui/Button";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/Modal";
import { useDeleteInvoice, useDownloadInvoice } from "@/lib/hooks/useInvoices";
import { formatDate, formatDateTime, formatCurrency, cn } from "@/lib/utils";
import { InvoiceStatus } from "@/lib/types";

const WORKFLOW_STEPS: { key: string; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

function getWorkflowIndex(status: InvoiceStatus): number {
  const map: Record<InvoiceStatus, number> = {
    draft: -1,
    pending: 0,
    under_review: 1,
    flagged: 1,
    approved: 2,
    paid: 3,
  };
  return map[status] ?? 0;
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: queryKeys.invoice(orgId, id),
    queryFn: () => getInvoice(id),
    enabled: !!orgId,
    placeholderData: MOCK_INVOICE,
  });

  const deleteInvoice = useDeleteInvoice();
  const downloadInvoice = useDownloadInvoice();

  if (isLoading) return <PageSpinner />;
  if (!invoice) return null;

  const workflowIdx = getWorkflowIndex(invoice.status);
  const canEdit = invoice.status === "draft" || invoice.status === "pending";
  const canDelete = invoice.status === "draft";

  const handleDelete = async () => {
    await deleteInvoice.mutateAsync(invoice.id);
    router.push("/invoices");
  };

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold">{invoice.invoice_number}</h1>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invoice.submission_date
                  ? `Sent on ${formatDate(invoice.submission_date)}`
                  : "Draft — not yet submitted"}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => router.push(`/invoices/create?edit=${invoice.id}`)}
              >
                <Edit className="h-4 w-4" />
                Edit Invoice
              </Button>
            )}
            <Button
              variant="primary"
              loading={downloadInvoice.isPending}
              onClick={() =>
                downloadInvoice.mutate({
                  id: invoice.id,
                  invoice_number: invoice.invoice_number,
                })
              }
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          {/* Left column */}
          <div className="space-y-4">
            {/* Summary card */}
            <div className="bg-white rounded-2xl border border-dashboard-border p-6">
              <h2 className="text-base font-semibold mb-4">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 border-t border-border pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Organization</p>
                  <p className="text-sm font-semibold mt-0.5">{invoice.organization}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-sm font-semibold mt-0.5">
                    {formatCurrency(invoice.total_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Related PO</p>
                  <p className="text-sm font-semibold mt-0.5">
                    {invoice.related_po ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Status</p>
                  <p className="text-sm font-semibold mt-0.5 capitalize">
                    {invoice.payment_status}
                  </p>
                </div>
              </div>
            </div>

            {/* Invoice items table */}
            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">
                  Invoice Items{" "}
                  <span className="text-muted-foreground font-normal">
                    {invoice.items.length}
                  </span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Quantity", "Unit Price", "Total"].map((col) => (
                        <th
                          key={col}
                          className="px-6 py-3 text-left text-xs font-medium text-muted-foreground"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border/60"
                      >
                        <td className="px-6 py-3.5 text-sm font-medium">
                          {item.name}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="px-6 py-3.5 text-sm font-medium">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={3} className="px-6 py-3.5 text-sm font-semibold text-right text-muted-foreground">
                        Total Amount
                      </td>
                      <td className="px-6 py-3.5 text-sm font-bold text-foreground">
                        {formatCurrency(invoice.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Delete button (draft only) */}
            {canDelete && (
              <div className="pt-2">
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Invoice
                </Button>
              </div>
            )}
          </div>

          {/* Right: Invoice status workflow */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-5 h-fit">
            <h3 className="text-sm font-semibold mb-4">Invoice Status</h3>
            <div className="space-y-0">
              {WORKFLOW_STEPS.map((step, idx) => {
                const isCompleted = idx <= workflowIdx;
                const isLast = idx === WORKFLOW_STEPS.length - 1;

                // Get timestamp from invoice workflow
                const wf = invoice.workflow?.find((w) => w.status === step.key);

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                          isCompleted
                            ? "border-primary bg-primary"
                            : "border-border bg-white"
                        )}
                      >
                        {isCompleted && (
                          <div className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "w-0.5 my-1",
                            isCompleted ? "bg-primary" : "bg-border"
                          )}
                          style={{ minHeight: 24 }}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isCompleted
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </p>
                      {wf?.timestamp && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(wf.timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(o) => !o && setShowDeleteConfirm(false)}
      >
        <DialogContent size="sm">
          <DialogTitle>Delete Invoice</DialogTitle>
          <DialogDescription className="mt-1.5">
            Are you sure you want to delete{" "}
            <strong>{invoice.invoice_number}</strong>? This action cannot be
            undone.
          </DialogDescription>
          <div className="flex gap-3 mt-5">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={deleteInvoice.isPending}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const MOCK_INVOICE = {
  id: "1",
  invoice_number: "In-234-53",
  org_id: "org1",
  organization: "ABC Enterprise",
  related_po: "PO-2024-001",
  status: "pending" as const,
  payment_status: "pending" as const,
  submission_date: "2024-03-15",
  amount: 200000,
  tax_rate: 0,
  subtotal: 200000,
  total_amount: 200000,
  delivery_date: "2024-04-15",
  items: [
    { id: "i1", name: "Heavy Duty Pallets", quantity: 10, unit_price: 4000, total: 40000 },
    { id: "i2", name: "Industrial Shrink Wrap", quantity: 10, unit_price: 4000, total: 40000 },
    { id: "i3", name: "Heavy Duty Pallets", quantity: 10, unit_price: 4000, total: 40000 },
    { id: "i4", name: "Industrial Shrink Wrap", quantity: 10, unit_price: 4000, total: 40000 },
    { id: "i5", name: "Heavy Duty Pallets", quantity: 10, unit_price: 4000, total: 40000 },
  ],
  workflow: [
    { status: "submitted", label: "Submitted", completed: true, timestamp: "2025-09-10T19:07:00Z" },
    { status: "under_review", label: "Under Review", completed: false },
    { status: "approved", label: "Approved", completed: false },
    { status: "paid", label: "Paid", completed: false },
  ],
};
