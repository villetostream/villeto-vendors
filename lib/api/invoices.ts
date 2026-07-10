/**
 * INVOICES API
 * Vendor-portal endpoints for invoice submission and management.
 *
 * All payloads are typed against InvoiceLineItemInput (name, description,
 * quantity, unitPrice, taxAmount, sku, unitOfMeasure only) — deliberately
 * excluding the buyer/accounting-internal fields present in the raw
 * backend schema (categoryId, departmentId, accountingAccountRef,
 * accountingItemRef, accountingClassRef, accountingLocationRef,
 * accountingProjectRef, accountingTaxCodeRef, accountingResolutionStatus,
 * vendorSelectionMode, catalogVendorId, lockedVendorId, preferredVendorId).
 * Those look like they belong to the buyer-side procurement/accounting
 * system, not something a vendor should ever fill in — confirm with
 * backend before any of them are added to a vendor-facing form.
 */

import { apiClient } from "./client";
import {
  ApiEnvelope,
  CreateInvoicePayload,
  Invoice,
  InvoiceFilters,
  UpdateInvoicePayload,
} from "@/lib/types";

/**
 * GET /vendor-portal/invoices?page=&limit=&status=&paymentStatus=&vendorId=&purchaseOrderId=
 * Returns a bare array today — same pagination caveat as orders.
 */
export async function getInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  const { data } = await apiClient.get<ApiEnvelope<Invoice[]>>("/vendor-portal/invoices", {
    params: filters,
  });
  return data.data;
}

/**
 * GET /vendor-portal/invoices/:invoiceId
 */
export async function getInvoice(invoiceId: string): Promise<Invoice> {
  const { data } = await apiClient.get<ApiEnvelope<Invoice>>(
    `/vendor-portal/invoices/${invoiceId}`
  );
  return data.data;
}

/**
 * POST /vendor-portal/invoices
 */
export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const { data } = await apiClient.post<ApiEnvelope<Invoice>>(
    "/vendor-portal/invoices",
    payload
  );
  return data.data;
}

/**
 * PATCH /vendor-portal/invoices/:invoiceId
 * Only allowed while the invoice hasn't progressed past "submitted" —
 * backend enforces this; frontend should still hide the edit action once
 * status moves to under_review/approved/rejected/paid rather than relying
 * solely on a 4xx response.
 */
export async function updateInvoice(
  invoiceId: string,
  payload: UpdateInvoicePayload
): Promise<Invoice> {
  const { data } = await apiClient.patch<ApiEnvelope<Invoice>>(
    `/vendor-portal/invoices/${invoiceId}`,
    payload
  );
  return data.data;
}

/**
 * DELETE /vendor-portal/invoices/:invoiceId
 */
export async function deleteInvoice(invoiceId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(`/vendor-portal/invoices/${invoiceId}`);
  return data;
}

/**
 * POST /vendor-portal/invoices/:invoiceId/line-items
 */
export async function addInvoiceLineItems(
  invoiceId: string,
  lineItems: CreateInvoicePayload["lineItems"]
): Promise<Invoice> {
  const { data } = await apiClient.post<ApiEnvelope<Invoice>>(
    `/vendor-portal/invoices/${invoiceId}/line-items`,
    { lineItems }
  );
  return data.data;
}
