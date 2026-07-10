/**
 * VENDOR MESSAGING API — UNCONFIRMED, NOT CURRENTLY USED.
 *
 * No backend endpoint exists for in-app messaging yet. These are the
 * frontend's best guess at a REST contract, kept here so there's a clear
 * target to hand to backend and a fast swap path once it exists.
 * lib/stores/messagingStore.ts is what the UI actually runs on today
 * (local, in-memory, per-company) — once this contract is confirmed and
 * implemented, replace that store's actions with react-query hooks that
 * call these functions, the same way useOrders/useInvoices wrap
 * lib/api/orders.ts / lib/api/invoices.ts.
 */

import { apiClient } from "./client";
import { ApiEnvelope, ChatMessage, ChatThread, ChatThreadTag } from "@/lib/types";

export async function getChatThreads(): Promise<ChatThread[]> {
  const { data } = await apiClient.get<ApiEnvelope<ChatThread[]>>("/vendor-portal/messages/threads");
  return data.data;
}

export async function getChatMessages(threadId: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<ApiEnvelope<ChatMessage[]>>(
    `/vendor-portal/messages/threads/${threadId}/messages`
  );
  return data.data;
}

export async function createChatThread(tag: ChatThreadTag, body: string): Promise<ChatThread> {
  const { data } = await apiClient.post<ApiEnvelope<ChatThread>>("/vendor-portal/messages/threads", {
    tag,
    body,
  });
  return data.data;
}

export async function sendChatMessage(threadId: string, body: string): Promise<ChatMessage> {
  const { data } = await apiClient.post<ApiEnvelope<ChatMessage>>(
    `/vendor-portal/messages/threads/${threadId}/messages`,
    { body }
  );
  return data.data;
}

export async function markThreadRead(threadId: string): Promise<void> {
  await apiClient.patch(`/vendor-portal/messages/threads/${threadId}/read`);
}
