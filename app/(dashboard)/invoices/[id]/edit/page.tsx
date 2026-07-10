"use client";

import { use, Suspense } from "react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { Spinner } from "@/components/ui/Spinner";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <InvoiceForm mode="edit" invoiceId={id} />
    </Suspense>
  );
}
