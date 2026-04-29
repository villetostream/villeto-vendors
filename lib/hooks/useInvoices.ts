"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
} from "@/lib/api/invoices";
import { useOrgStore, queryKeys } from "@/lib/stores/orgStore";
import { InvoiceFilters } from "@/lib/types";
import { toast } from "sonner";

export function useInvoices(filters: InvoiceFilters = {}) {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useQuery({
    queryKey: queryKeys.invoices(orgId, filters),
    queryFn: () => getInvoices(filters),
    enabled: !!orgId,
    staleTime: 1000 * 60,
  });
}

export function useInvoice(id: string) {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useQuery({
    queryKey: queryKeys.invoice(orgId, id),
    queryFn: () => getInvoice(id),
    enabled: !!orgId && !!id,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: (payload: Parameters<typeof createInvoice>[0]) =>
      createInvoice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", orgId] });
      toast.success("Invoice submitted for review");
    },
    onError: () => toast.error("Failed to create invoice"),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateInvoice>[1];
    }) => updateInvoice(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", orgId] });
      queryClient.setQueryData(queryKeys.invoice(orgId, data.id), data);
      toast.success("Invoice updated");
    },
    onError: () => toast.error("Failed to update invoice"),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", orgId] });
      toast.success("Invoice deleted");
    },
    onError: () => toast.error("Failed to delete invoice"),
  });
}

export function useDownloadInvoice() {
  return useMutation({
    mutationFn: async (invoice: { id: string; invoice_number: string }) => {
      const blob = await downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error("Failed to download invoice"),
  });
}
