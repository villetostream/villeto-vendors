"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, Download, MoreHorizontal } from "lucide-react";
import { useDownloadInvoice } from "@/lib/hooks/useInvoices";
import { cn } from "@/lib/utils";

interface InvoiceActionMenuProps {
  invoiceId: string;
  invoiceNumber: string;
}

export function InvoiceActionMenu({
  invoiceId,
  invoiceNumber,
}: InvoiceActionMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const download = useDownloadInvoice();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        aria-label="Invoice actions"
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-white rounded-xl border border-border shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
          {/* View Invoice */}
          <button
            onClick={() => {
              setOpen(false);
              router.push(`/invoices/${invoiceId}`);
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border"
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
            View Invoice
          </button>

          {/* Download */}
          <button
            onClick={() => {
              setOpen(false);
              download.mutate({ id: invoiceId, invoice_number: invoiceNumber });
            }}
            disabled={download.isPending}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors",
              download.isPending && "opacity-60 cursor-not-allowed"
            )}
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            {download.isPending ? "Downloading…" : "Download"}
          </button>
        </div>
      )}
    </div>
  );
}
