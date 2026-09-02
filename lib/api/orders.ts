/**
 * PURCHASE ORDERS API
 * Vendor-portal endpoints for purchase orders.
 */

import { apiClient } from "./client";
import {
  AcknowledgeOrderPayload,
  ApiEnvelope,
  CreateFulfillmentPayload,
  CreateFulfillmentResponse,
  DispatchFulfillmentPayload,
  Order,
  OrderFilters,
  OrderListItem,
} from "@/lib/types";

/**
 * GET /vendor-portal/orders?page=&limit=&status=
 * Returns a bare array today (no total/totalPages) — pagination UI can
 * only infer "has next page" from whether a full page came back, not show
 * a real page count, until backend adds a wrapper with totals.
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
 *
 * Vendor enters a per-item delivery date before acknowledging.
 * Sends { lineItems: [{ purchaseOrderLineItemId, deliveryDate }] }
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
 * POST /vendor-portal/orders/:purchaseOrderId/fulfillments
 *
 * Quantities are deltas for this immutable event. The backend reconciles
 * them against ordered quantities and all previously accepted events.
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

/** Mark a physical fulfillment as dispatched. This is a write-once, idempotent transition. */
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
