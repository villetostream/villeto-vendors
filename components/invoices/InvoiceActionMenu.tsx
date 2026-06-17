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

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
        aria-label="Invoice actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Invoice actions"
          className="absolute right-0 top-8 z-50 w-44 bg-white rounded-xl border border-border shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
        >
          {/* View Invoice */}
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

          {/* Download */}
          <button
            role="menuitem"
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
            <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {download.isPending ? "Downloading…" : "Download"}
          </button>
        </div>
      )}
    </div>
  );
}
