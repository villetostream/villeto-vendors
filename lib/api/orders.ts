/**
 * PURCHASE ORDERS API
 * Vendor-portal endpoints for purchase orders.
 */

import { apiClient, uploadClient } from "./client";
import {
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
  ReceiptEvidenceItem,
} from "@/lib/types";

// ============================================================================

/**
 * GET /vendor-portal/orders?page=&limit=&status=
 */
export async function getOrders(filters: OrderFilters = {}): Promise<OrderListItem[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderListItem[]>>("/vendor-portal/orders", {
    params: filters,
  });
  return data.data;
}

/**
 * GET /vendor-portal/orders/:purchaseOrderId
 */
export async function getOrder(purchaseOrderId: string): Promise<Order> {
  const { data } = await apiClient.get<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${purchaseOrderId}`
  );
  return data.data;
}

/**
 * PATCH /vendor-portal/orders/:purchaseOrderId/acknowledge
 */
export async function acknowledgeOrder(
  purchaseOrderId: string,
  payload?: AcknowledgeOrderPayload
): Promise<Order> {
  const { data } = await apiClient.patch<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${purchaseOrderId}/acknowledge`,
    payload
  );
  return data.data;
}

/**
 * PATCH /vendor-portal/orders/:purchaseOrderId/ready-for-delivery
 */
export async function markReadyForDelivery(purchaseOrderId: string): Promise<Order> {
  const { data } = await apiClient.patch<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${purchaseOrderId}/ready-for-delivery`
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
    `/vendor-portal/orders/${purchaseOrderId}/fulfillments`,
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
    `/vendor-portal/orders/${purchaseOrderId}/fulfillments/${fulfillmentId}/dispatch`,
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
  >(`/vendor-portal/fulfillment-exceptions/${deliveryReceiptId}`);
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
    `/vendor-portal/orders/${purchaseOrderId}/receipts/${deliveryReceiptId}/acknowledge`,
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
    `/vendor-portal/orders/${purchaseOrderId}/receipts/${deliveryReceiptId}/accept-final-decision`,
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
    `/vendor-portal/orders/${purchaseOrderId}/receipts/${deliveryReceiptId}/dispute`,
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
    `/vendor-portal/orders/${purchaseOrderId}/receipts/${deliveryReceiptId}/evidence`,
    formData
  );
  return (data as ApiEnvelope<ReceiptEvidenceItem>)?.data ?? (data as ReceiptEvidenceItem);
}
