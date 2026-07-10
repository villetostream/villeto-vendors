"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/notifications";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import { NotificationFilters } from "@/lib/types";
import { toast } from "sonner";

export function useNotifications(filters: NotificationFilters = {}) {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.notifications(companyId, filters),
    queryFn: () => getNotifications(filters),
    enabled: !!companyId,
    staleTime: 1000 * 30,
  });
}

/** Polls lightly so the bell badge stays current without a websocket. */
export function useUnreadNotificationCount() {
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useQuery({
    queryKey: queryKeys.unreadCount(companyId),
    queryFn: getUnreadNotificationCount,
    enabled: !!companyId,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60, // 1 min
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "notifications", companyId] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-portal", "notifications", companyId] });
      toast.success("All notifications marked as read");
    },
    onError: () => toast.error("Failed to mark notifications as read"),
  });
}
