/**
 * INVOICES API
 * All endpoints for invoice management.
 */

import { apiClient } from "./client";
import { Invoice, InvoiceFilters, PaginatedResponse } from "@/lib/types";

/**
 * Get paginated invoices.
 * GET /invoices?org_id=xxx&status=xxx&page=1
 */
export async function getInvoices(
  filters: InvoiceFilters = {}
): Promise<PaginatedResponse<Invoice>> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/invoices", { params: filters });
  return data.data;
}

/**
 * Get a single invoice.
 * GET /invoices/:id
 */
export async function getInvoice(id: string): Promise<Invoice> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(`/invoices/${id}`);
  return data.data;
}

/**
 * Create a new invoice.
 * POST /invoices
 */
export async function createInvoice(payload: {
  order_id?: string;
  delivery_date: string;
  items: { name: string; quantity: number; unit_price: number }[];
}): Promise<Invoice> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post("/invoices", payload);
  return data.data;
}

/**
 * Update/edit an invoice (only allowed for draft/pending status).
 * PATCH /invoices/:id
 */
export async function updateInvoice(
  id: string,
  payload: Partial<{
    delivery_date: string;
    items: { id?: string; name: string; quantity: number; unit_price: number }[];
  }>
): Promise<Invoice> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.patch(`/invoices/${id}`, payload);
  return data.data;
}

/**
 * Delete a draft invoice.
 * DELETE /invoices/:id
 */
export async function deleteInvoice(id: string): Promise<{ success: boolean }> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.delete(`/invoices/${id}`);
  return data;
}

/**
 * Download invoice as PDF.
 * GET /invoices/:id/download
 * Returns: Blob
 */
export async function downloadInvoicePdf(id: string): Promise<Blob> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(`/invoices/${id}/download`, {
    responseType: "blob",
  });
  return data;
}
