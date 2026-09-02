/**
 * PURCHASE ORDERS API
 * Vendor-portal endpoints for purchase orders.
 */

import { apiClient } from "./client";
import {
  AcknowledgeOrderPayload,
  ApiEnvelope,
  CreateFulfillmentPayload,
  DispatchFulfillmentPayload,
  CreateFulfillmentResponse,
  Fulfillment,
  Order,
  OrderFilters,
  OrderLineItem,
  OrderListItem,
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
