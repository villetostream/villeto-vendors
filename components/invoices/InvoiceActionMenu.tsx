"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useDeleteInvoice } from "@/lib/hooks/useInvoices";
import { cn } from "@/lib/utils";
import { InvoiceStatus } from "@/lib/types";
import { toast } from "sonner";

interface InvoiceActionMenuProps {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
}

/**
 * Edit/delete are only offered while status === "submitted" — backend
 * only allows mutating an invoice at that stage (see updateInvoice /
 * deleteInvoice comments in lib/api/invoices.ts). Hiding the actions here
 * avoids a vendor clicking Edit on an approved/paid invoice and hitting a
 * confusing 4xx.
 *
 * NOTE: PDF download was removed — no confirmed backend endpoint exists
 * for it yet. Re-add once backend confirms one.
 */
export function InvoiceActionMenu({ invoiceId, invoiceNumber, status }: InvoiceActionMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteInvoice = useDeleteInvoice();

  const canEdit = status === "submitted";

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        aria-label={`Actions for invoice ${invoiceNumber}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Invoice actions"
          className="absolute right-0 top-8 z-50 w-48 bg-white rounded-xl border border-border shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push(`/invoices/${invoiceId}`);
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border"
          >
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            View Invoice
          </button>

          {canEdit && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push(`/invoices/${invoiceId}/edit`);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Edit Invoice
            </button>
          )}

          {canEdit && (
            <button
              role="menuitem"
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  return;
                }
                deleteInvoice.mutate(invoiceId, {
                  onError: () => toast.error("Couldn't delete this invoice."),
                });
                setOpen(false);
                setConfirmingDelete(false);
              }}
              disabled={deleteInvoice.isPending}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors",
                confirmingDelete ? "text-red-700 bg-red-50" : "text-red-600 hover:bg-red-50",
                deleteInvoice.isPending && "opacity-60 cursor-not-allowed"
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deleteInvoice.isPending ? "Deleting…" : confirmingDelete ? "Click again to confirm" : "Delete Invoice"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
