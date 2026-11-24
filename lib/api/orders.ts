/**
 * PURCHASE ORDERS API
 * Vendor-portal endpoints for purchase orders.
 */

import { apiClient, uploadClient } from "./client";
import {
  AcknowledgeOrderLineItemPayload,
  AcknowledgeOrderPayload,
  AcknowledgeReceiptPayload,
  ApiEnvelope,
  CreateFulfillmentPayload,
  DispatchFulfillmentPayload,
  CreateFulfillmentResponse,
  DisputeReceiptPayload,
  Fulfillment,
  FulfillmentExceptionDetail,
  FulfillmentExceptionFilters,
  FulfillmentExceptionListItem,
  Order,
  OrderFilters,
  OrderLineItem,
  OrderListItem,
  OrderListWithMeta,
  PriceChangeEligibility,
  PriceChangeRequestDetail,
  PriceChangeRequestSummary,
  PriceComparison,
  PriceProposalPayload,
  ReceiptEvidenceItem,
} from "@/lib/types";

// ============================================================================

/**
 * GET /vendor-portal/orders?page=&limit=&status=
 */
export async function getOrders(filters: OrderFilters = {}): Promise<OrderListWithMeta> {
  const { data } = await apiClient.get<ApiEnvelope<OrderListItem[]>>("/vendor-portal/orders", {
    params: filters,
  });
  return Object.assign([...(data.data ?? [])], {
    meta: data.meta,
  });
}

/**
 * GET /vendor-portal/orders/:purchaseOrderId
 */
export async function getOrder(purchaseOrderId: string): Promise<Order> {
  const { data } = await apiClient.get<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}`
  );
  return data.data;
}

/**
 * PATCH /vendor-portal/orders/:purchaseOrderId/acknowledge
 *
 * Vendor enters a per-item delivery date before acknowledging.
 * Sends { lineItems: [{ purchaseOrderLineItemId, promisedDeliveryDate }] }.
 * Returns a compact order summary; fetch detail for persisted dates and timeline.
 */
export async function acknowledgeOrder(
  purchaseOrderId: string,
  payload: AcknowledgeOrderPayload
): Promise<OrderListItem> {
  const { data } = await apiClient.patch<ApiEnvelope<OrderListItem>>(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/acknowledge`,
    payload
  );
  return data.data;
}

/**
 * PATCH /vendor-portal/orders/:purchaseOrderId/ready-for-delivery
 */
export async function markReadyForDelivery(purchaseOrderId: string): Promise<Order> {
  const { data } = await apiClient.patch<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/ready-for-delivery`
  );
  return data.data;
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/fulfillments
 */
export async function createFulfillment(
  purchaseOrderId: string,
  payload: CreateFulfillmentPayload
): Promise<CreateFulfillmentResponse> {
  const { data } = await apiClient.post<ApiEnvelope<CreateFulfillmentResponse>>(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/fulfillments`,
    payload
  );
  return data.data;
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/fulfillments/:fulfillmentId/dispatch
 */
export async function dispatchFulfillment(
  purchaseOrderId: string,
  fulfillmentId: string,
  payload: DispatchFulfillmentPayload
): Promise<CreateFulfillmentResponse> {
  const { data } = await apiClient.post<ApiEnvelope<CreateFulfillmentResponse>>(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}/dispatch`,
    payload
  );
  return data.data;
}

// ============================================================================
// FULFILLMENT EXCEPTIONS & DELIVERY RECEIPT RESOLUTION
// ============================================================================

/**
 * GET /vendor-portal/fulfillment-exceptions
 * List receipt exceptions requiring or showing a vendor response.
 */
export async function getFulfillmentExceptions(
  filters: FulfillmentExceptionFilters = {}
): Promise<FulfillmentExceptionListItem[]> {
  const params = {
    ...filters,
    resolutionStatus: filters.resolutionStatus === "all" ? undefined : filters.resolutionStatus,
  };
  const { data } = await apiClient.get<
    ApiEnvelope<FulfillmentExceptionListItem[]> | FulfillmentExceptionListItem[]
  >("/vendor-portal/fulfillment-exceptions", { params });
  if (Array.isArray(data)) return data;
  return data?.data ?? [];
}

/**
 * GET /vendor-portal/fulfillment-exceptions/:deliveryReceiptId
 * Get one vendor fulfillment exception / dispute detail.
 */
export async function getFulfillmentException(
  deliveryReceiptId: string
): Promise<FulfillmentExceptionDetail> {
  const { data } = await apiClient.get<
    ApiEnvelope<FulfillmentExceptionDetail> | FulfillmentExceptionDetail
  >(`/vendor-portal/fulfillment-exceptions/${encodeURIComponent(deliveryReceiptId)}`);
  return (data as ApiEnvelope<FulfillmentExceptionDetail>)?.data ?? (data as FulfillmentExceptionDetail);
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/receipts/:deliveryReceiptId/acknowledge
 * Accept a buyer finding and backorder or forfeit rejected/missing units.
 */
export async function acknowledgeReceiptException(
  purchaseOrderId: string,
  deliveryReceiptId: string,
  payload: AcknowledgeReceiptPayload
): Promise<FulfillmentExceptionDetail> {
  const { data } = await apiClient.post<
    ApiEnvelope<FulfillmentExceptionDetail> | FulfillmentExceptionDetail
  >(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/receipts/${encodeURIComponent(deliveryReceiptId)}/acknowledge`,
    payload
  );
  return (data as ApiEnvelope<FulfillmentExceptionDetail>)?.data ?? (data as FulfillmentExceptionDetail);
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/receipts/:deliveryReceiptId/accept-final-decision
 * Accept the company's final decision and allocate any remaining rejected/missing units
 * to backorder or forfeit.  Same 4-tier payload structure as acknowledgeReceiptException.
 *
 * Only call this when:
 *   - `receipt.finalDecision` is set (company has reviewed the dispute), AND
 *   - Some line items still have unresolved quantities after the company decision
 *     (e.g. finalQuantityRejected > 0 or finalQuantityMissing > 0).
 */
export async function acceptFinalDecision(
  purchaseOrderId: string,
  deliveryReceiptId: string,
  payload: AcknowledgeReceiptPayload
): Promise<FulfillmentExceptionDetail> {
  const { data } = await apiClient.post<
    ApiEnvelope<FulfillmentExceptionDetail> | FulfillmentExceptionDetail
  >(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/receipts/${encodeURIComponent(deliveryReceiptId)}/accept-final-decision`,
    payload
  );
  return (data as ApiEnvelope<FulfillmentExceptionDetail>)?.data ?? (data as FulfillmentExceptionDetail);
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/receipts/:deliveryReceiptId/dispute
 * Submit the vendor one-time receipt dispute.
 */
export async function disputeReceiptException(
  purchaseOrderId: string,
  deliveryReceiptId: string,
  payload: DisputeReceiptPayload
): Promise<FulfillmentExceptionDetail> {
  const { data } = await apiClient.post<
    ApiEnvelope<FulfillmentExceptionDetail> | FulfillmentExceptionDetail
  >(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/receipts/${encodeURIComponent(deliveryReceiptId)}/dispute`,
    payload
  );
  return (data as ApiEnvelope<FulfillmentExceptionDetail>)?.data ?? (data as FulfillmentExceptionDetail);
}

/**
 * POST /vendor-portal/orders/:purchaseOrderId/receipts/:deliveryReceiptId/evidence
 * Upload optional evidence image (JPEG, PNG, or WebP up to 5 MB) for a vendor dispute.
 */
export async function uploadReceiptEvidence(
  purchaseOrderId: string,
  deliveryReceiptId: string,
  file: File
): Promise<ReceiptEvidenceItem> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await uploadClient.post<
    ApiEnvelope<ReceiptEvidenceItem> | ReceiptEvidenceItem
  >(
    `/vendor-portal/orders/${encodeURIComponent(purchaseOrderId)}/receipts/${encodeURIComponent(deliveryReceiptId)}/evidence`,
    formData
  );
  return (data as ApiEnvelope<ReceiptEvidenceItem>)?.data ?? (data as ReceiptEvidenceItem);
}

// ============================================================================
// PRICE CHANGE PROPOSALS & NEGOTIATION API
// ============================================================================

const PO_CHANGE_REQUESTS_ROOT = "/vendor-portal/po-change-requests";

/**
 * GET /vendor-portal/po-change-requests/orders/:purchaseOrderId/eligibility
 * Checks if line items on this order are eligible for vendor price change proposals.
 */
export async function getPriceChangeEligibility(
  purchaseOrderId: string
): Promise<PriceChangeEligibility> {
  const { data } = await apiClient.get<ApiEnvelope<PriceChangeEligibility>>(
    `${PO_CHANGE_REQUESTS_ROOT}/orders/${encodeURIComponent(purchaseOrderId)}/eligibility`
  );
  return data.data;
}

/**
 * GET /vendor-portal/po-change-requests?purchaseOrderId=&page=&limit=
 * Lists price change requests for this order.
 */
export async function getPriceChangeRequests(
  purchaseOrderId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ data: PriceChangeRequestSummary[]; meta: { totalPages: number } }> {
  const { data } = await apiClient.get<{ data: PriceChangeRequestSummary[]; meta: { totalPages: number } }>(
    PO_CHANGE_REQUESTS_ROOT,
    { params: { purchaseOrderId, page, limit } }
  );
  return data;
}

/**
 * GET /vendor-portal/po-change-requests/:priceChangeRequestId
 * Retrieves detailed proposal, comparison, and action history for a request.
 */
export async function getPriceChangeRequestDetail(
  priceChangeRequestId: string
): Promise<PriceChangeRequestDetail> {
  const { data } = await apiClient.get<ApiEnvelope<PriceChangeRequestDetail>>(
    `${PO_CHANGE_REQUESTS_ROOT}/${encodeURIComponent(priceChangeRequestId)}`
  );
  return data.data;
}

/**
 * POST /vendor-portal/po-change-requests/orders/:purchaseOrderId/preview
 * Recalculates commitment totals, tax, and difference before submission.
 */
export async function previewPriceChangeProposal(
  purchaseOrderId: string,
  payload: PriceProposalPayload
): Promise<PriceComparison> {
  const { data } = await apiClient.post<ApiEnvelope<PriceComparison>>(
    `${PO_CHANGE_REQUESTS_ROOT}/orders/${encodeURIComponent(purchaseOrderId)}/preview`,
    payload
  );
  return data.data;
}

/**
 * POST /vendor-portal/po-change-requests/orders/:purchaseOrderId
 * Submits a new price change proposal.
 */
export async function submitPriceChangeProposal(
  purchaseOrderId: string,
  payload: PriceProposalPayload
): Promise<PriceChangeRequestDetail> {
  const { data } = await apiClient.post<ApiEnvelope<PriceChangeRequestDetail>>(
    `${PO_CHANGE_REQUESTS_ROOT}/orders/${encodeURIComponent(purchaseOrderId)}`,
    payload
  );
  return data.data;
}

/**
 * POST /vendor-portal/po-change-requests/:priceChangeRequestId/resubmit
 * Resubmits a proposal that was returned for correction.
 */
export async function resubmitPriceChangeProposal(
  priceChangeRequestId: string,
  payload: PriceProposalPayload & { expectedVersion: number }
): Promise<PriceChangeRequestDetail> {
  const { data } = await apiClient.post<ApiEnvelope<PriceChangeRequestDetail>>(
    `${PO_CHANGE_REQUESTS_ROOT}/${encodeURIComponent(priceChangeRequestId)}/resubmit`,
    payload
  );
  return data.data;
}

/**
 * POST /vendor-portal/po-change-requests/:priceChangeRequestId/withdraw
 * Withdraws a pending or returned-for-correction proposal.
 */
export async function withdrawPriceChangeProposal(
  priceChangeRequestId: string,
  payload: { expectedVersion: number }
): Promise<PriceChangeRequestDetail> {
  const { data } = await apiClient.post<ApiEnvelope<PriceChangeRequestDetail>>(
    `${PO_CHANGE_REQUESTS_ROOT}/${encodeURIComponent(priceChangeRequestId)}/withdraw`,
    payload
  );
  return data.data;
}
