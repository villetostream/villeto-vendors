/**
 * VENDOR NOTIFICATIONS API
 *
 * Scoped to the currently selected vendor/company context — switching
 * company changes the inbox entirely (confirmed by backend: same model as
 * switching Gmail accounts, notifications don't cross accounts). This
 * means a vendor working with 3 companies has no built-in way to see
 * "Company C has 2 unread" without switching into it — flagged as an
 * enhancement to raise with backend (add unreadCount per row on
 * GET /vendors/me/companies), not fixed here.
 *
 * Invitations to a *new* company are never in this list — they arrive by
 * email only, since the vendor-company record this table scopes to
 * doesn't exist until the invite is accepted (confirmed by backend).
 */

import { apiClient } from "./client";
import { ApiEnvelope, NotificationFilters, VendorNotification } from "@/lib/types";

export async function getNotifications(
  filters: NotificationFilters = {}
): Promise<VendorNotification[]> {
  const { data } = await apiClient.get<ApiEnvelope<VendorNotification[]>>(
    "/vendor-portal/notifications",
    { params: filters }
  );
  return data.data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await apiClient.get<ApiEnvelope<{ count: number }>>(
    "/vendor-portal/notifications/unread-count"
  );
  return data.data.count;
}

export async function markNotificationRead(notificationId: string): Promise<VendorNotification> {
  const { data } = await apiClient.patch<ApiEnvelope<VendorNotification>>(
    `/vendor-portal/notifications/${notificationId}/read`
  );
  return data.data;
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  const { data } = await apiClient.patch<ApiEnvelope<{ updatedCount: number }>>(
    "/vendor-portal/notifications/read-all"
  );
  return data.data;
}
