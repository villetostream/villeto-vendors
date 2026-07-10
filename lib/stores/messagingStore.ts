"use client";

/**
 * TEMPORARY: no backend endpoint exists for messaging at all yet — this
 * store holds threads/messages entirely client-side (lost on refresh) so
 * the feature is fully demoable now. lib/api/messaging.ts has the guessed
 * REST contract ready to swap in once backend confirms a real one; when
 * that happens, replace the actions below with react-query mutations the
 * same way useOrders/useInvoices work, and delete this store.
 *
 * Scoped by companyId, same pattern as notifications — switching company
 * shows a different set of threads, never a mixed one.
 */

import { create } from "zustand";
import { ChatMessage, ChatThread, ChatThreadTag } from "@/lib/types";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface MessagingState {
  threadsByCompany: Record<string, ChatThread[]>;
  isOpen: boolean;
  view: "list" | "new" | "conversation";
  activeThreadId: string | null;

  open: () => void;
  close: () => void;
  showList: () => void;
  showNewConversation: () => void;
  openThread: (threadId: string) => void;

  ensureCompanySeeded: (companyId: string) => void;
  getThreads: (companyId: string) => ChatThread[];
  getUnreadCount: (companyId: string) => number;
  createThread: (companyId: string, companyName: string, tag: ChatThreadTag, firstMessage: string) => string;
  sendMessage: (companyId: string, threadId: string, body: string) => void;
  markThreadRead: (companyId: string, threadId: string) => void;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  threadsByCompany: {},
  isOpen: false,
  view: "list",
  activeThreadId: null,

  open: () => set({ isOpen: true, view: "list" }),
  close: () => set({ isOpen: false }),
  showList: () => set({ view: "list", activeThreadId: null }),
  showNewConversation: () => set({ view: "new" }),
  openThread: (threadId) => set({ view: "conversation", activeThreadId: threadId }),

  ensureCompanySeeded: (companyId) => {
    const existing = get().threadsByCompany[companyId];
    if (existing) return;
    set((state) => ({
      threadsByCompany: { ...state.threadsByCompany, [companyId]: [] },
    }));
  },

  getThreads: (companyId) => get().threadsByCompany[companyId] ?? [],

  getUnreadCount: (companyId) =>
    (get().threadsByCompany[companyId] ?? []).reduce((sum, t) => sum + t.unreadCount, 0),

  createThread: (companyId, companyName, tag, firstMessage) => {
    const threadId = generateId();
    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: generateId(),
      threadId,
      senderType: "vendor",
      senderName: "You",
      body: firstMessage,
      sentAt: now,
    };
    const thread: ChatThread = {
      id: threadId,
      companyId,
      companyName,
      tag,
      messages: [message],
      unreadCount: 0,
      createdAt: now,
    };
    set((state) => ({
      threadsByCompany: {
        ...state.threadsByCompany,
        [companyId]: [thread, ...(state.threadsByCompany[companyId] ?? [])],
      },
    }));
    return threadId;
  },

  sendMessage: (companyId, threadId, body) => {
    const message: ChatMessage = {
      id: generateId(),
      threadId,
      senderType: "vendor",
      senderName: "You",
      body,
      sentAt: new Date().toISOString(),
    };
    set((state) => ({
      threadsByCompany: {
        ...state.threadsByCompany,
        [companyId]: (state.threadsByCompany[companyId] ?? []).map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, message] } : t
        ),
      },
    }));
  },

  markThreadRead: (companyId, threadId) => {
    set((state) => ({
      threadsByCompany: {
        ...state.threadsByCompany,
        [companyId]: (state.threadsByCompany[companyId] ?? []).map((t) =>
          t.id === threadId ? { ...t, unreadCount: 0 } : t
        ),
      },
    }));
  },
}));
