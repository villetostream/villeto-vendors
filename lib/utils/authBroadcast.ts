"use client";

import { AUTH_BROADCAST_CHANNEL } from "@/lib/constants/auth";

/**
 * Why this exists:
 * Per the product decision that a vendor must never be unsure which
 * company they're currently working with, a company switch in one tab
 * must not leave a second open tab quietly transacting against the old
 * company context. Since switch-company now issues a brand-new JWT (and
 * the old one is expected to be invalidated server-side), a stale tab
 * will eventually get a 401 anyway — but that can take one full request
 * round-trip during which the vendor might see wrong data. Broadcasting
 * the switch immediately closes that window.
 */

export type AuthBroadcastEvent =
  | { type: "company-switched"; companyId: string; companyName: string }
  | { type: "logout" };

type Listener = (event: AuthBroadcastEvent) => void;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
}

export function broadcastAuthEvent(event: AuthBroadcastEvent) {
  const channel = getChannel();
  if (!channel) return;
  channel.postMessage(event);
  channel.close();
}

/**
 * Subscribe to auth events from other tabs. Returns an unsubscribe function.
 * Falls back to a no-op in environments without BroadcastChannel (very old
 * browsers) — those tabs simply rely on the next request's 401 instead.
 */
export function subscribeToAuthBroadcast(listener: Listener): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  const handler = (event: MessageEvent<AuthBroadcastEvent>) => listener(event.data);
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}
