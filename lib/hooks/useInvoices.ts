"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  addInvoiceLineItems,
} from "@/lib/api/invoices";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { CreateInvoicePayload, InvoiceFilters, UpdateInvoicePayload } from "@/lib/types";
import { toast } from "sonner";
// import { format } from "date-fns";

export function useInvoices(filters: InvoiceFilters = {}) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";
  // const dateRange = useCompanyStore((s) => s.dateRange);

  const mergedFilters: InvoiceFilters = {
    ...filters,
    // TODO: Uncomment when backend supports date filtering (currently causes 400 Bad Request)
    // ...(dateRange?.from && { startDate: format(dateRange.from, "yyyy-MM-dd") }),
    // ...(dateRange?.to && { endDate: format(dateRange.to, "yyyy-MM-dd") }),
  };

  return useQuery({
    queryKey: queryKeys.invoices(companyId, mergedFilters),
    queryFn: () => getInvoices(mergedFilters),
    enabled: !!companyId,
  });
}

export function useInvoice(invoiceId: string) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.invoice(companyId, invoiceId),
    queryFn: () => getInvoice(invoiceId),
    enabled: !!companyId && !!invoiceId,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) => createInvoice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "invoices", companyId] });
      toast.success("Invoice submitted for review");
    },
    onError: () => toast.error("Failed to create invoice"),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateInvoicePayload }) =>
      updateInvoice(id, payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "invoices", companyId] });
      if (data?.vendorInvoiceId && data?.invoiceNumber) {
        queryClient.setQueryData(queryKeys.invoice(companyId, data.vendorInvoiceId), data);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoice(companyId, variables.id) });
      }
      toast.success("Invoice updated");
    },
    onError: () => toast.error("Failed to update invoice"),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "invoices", companyId] });
      toast.success("Invoice deleted");
    },
    onError: () => toast.error("Failed to delete invoice"),
  });
}

export function useAddInvoiceLineItems() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: ({ id, lineItems }: { id: string; lineItems: CreateInvoicePayload["lineItems"] }) =>
      addInvoiceLineItems(id, lineItems),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "invoices", companyId] });
      if (data?.vendorInvoiceId && data?.invoiceNumber) {
        queryClient.setQueryData(queryKeys.invoice(companyId, data.vendorInvoiceId), data);
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoice(companyId, variables.id) });
      }
      toast.success("Line items added");
    },
    onError: () => toast.error("Failed to add line items"),
  });
}

// NOTE: downloadInvoicePdf was removed — no confirmed backend endpoint
// for it in the real vendor-portal API. Re-add once backend confirms
// GET /vendor-portal/invoices/:id/download (or equivalent) exists.
