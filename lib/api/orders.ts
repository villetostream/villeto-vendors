/**
 * PURCHASE ORDERS API
 * Vendor-portal endpoints for purchase orders.
 */

import { apiClient } from "./client";
import {
  AcknowledgeOrderPayload,
  ApiEnvelope,
  ConfirmDeliveryPayload,
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
 * PATCH /vendor-portal/orders/:purchaseOrderId/ready-for-delivery
 */
export async function markReadyForDelivery(purchaseOrderId: string): Promise<Order> {
  const { data } = await apiClient.patch<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${purchaseOrderId}/ready-for-delivery`
  );
  return data.data;
}

/**
 * UNCONFIRMED ENDPOINT — no delivery-confirmation contract exists yet.
 * Guessed as `PATCH /vendor-portal/orders/:purchaseOrderId/confirm-delivery`
 * taking `{ deliveryType: "full" | "partial", lineItems: [...] }`, where
 * "full" delivers every item at its full ordered quantity and "partial"
 * carries the vendor-entered (capped, never exceeding ordered quantity)
 * quantities. Resulting order.status is expected to become "delivered"
 * for a full delivery or "partially_delivered" for a partial one — verify
 * both the path and the status transition with backend before shipping.
 */
export async function confirmDelivery(
  purchaseOrderId: string,
  payload: ConfirmDeliveryPayload
): Promise<Order> {
  const { data } = await apiClient.patch<ApiEnvelope<Order>>(
    `/vendor-portal/orders/${purchaseOrderId}/confirm-delivery`,
    payload
  );
  return data.data;
}
