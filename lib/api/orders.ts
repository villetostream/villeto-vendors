/**
 * ORDERS API
 * All endpoints for purchase orders.
 */

import { apiClient } from "./client";
import { Order, OrderFilters, PaginatedResponse } from "@/lib/types";

/**
 * Get paginated orders.
 * GET /orders?org_id=xxx&status=xxx&page=1
 *
 * org_id is injected automatically by apiClient interceptor via X-Org-Id header.
 */
export async function getOrders(
  filters: OrderFilters = {}
): Promise<PaginatedResponse<Order>> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get("/orders", { params: filters });
  return data.data;
}

/**
 * Get a single order with full details.
 * GET /orders/:id
 */
export async function getOrder(id: string): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.get(`/orders/${id}`);
  return data.data;
}

/**
 * Acknowledge an assigned order.
 * POST /orders/:id/acknowledge
 *
 * Includes delivery dates per item.
 */
export async function acknowledgeOrder(
  id: string,
  payload: { items: { id: string; delivery_date: string }[] }
): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(`/orders/${id}/acknowledge`, payload);
  return data.data;
}

/**
 * Mark order as ready for delivery.
 * POST /orders/:id/ready-for-delivery
 */
export async function markReadyForDelivery(id: string): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(`/orders/${id}/ready-for-delivery`);
  return data.data;
}

/**
 * Mark order as delivered (full delivery).
 * POST /orders/:id/deliver
 * body: { type: "full" }
 */
export async function markFullDelivery(id: string): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(`/orders/${id}/deliver`, {
    type: "full",
  });
  return data.data;
}

/**
 * Mark order as partially delivered.
 * POST /orders/:id/deliver
 * body: { type: "partial", items: [{ id, delivered_quantity }] }
 */
export async function markPartialDelivery(
  id: string,
  items: { id: string; delivered_quantity: number }[]
): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(`/orders/${id}/deliver`, {
    type: "partial",
    items,
  });
  return data.data;
}

/**
 * Fulfill remaining items for a partially-delivered order.
 * POST /orders/:id/fulfill
 * body: { items: [{ id, delivered_quantity }] }
 */
export async function fulfillRemainingDelivery(
  id: string,
  items: { id: string; delivered_quantity: number }[]
): Promise<Order> {
  // INTEGRATION POINT ↓
  const { data } = await apiClient.post(`/orders/${id}/fulfill`, { items });
  return data.data;
}
