"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ArrowLeft, Send, Inbox } from "lucide-react";
import { useMessagingStore } from "@/lib/stores/messagingStore";
import { useCompany } from "@/lib/hooks/useCompany";
import { getOrders } from "@/lib/api/orders";
import { getInvoices } from "@/lib/api/invoices";
import { queryKeys, useCompanyStore } from "@/lib/stores/companyStore";
import { ChatThreadTag } from "@/lib/types";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";

const GENERAL_TAG: ChatThreadTag = { id: "general", type: "general", label: "General" };

function ChatWidgetIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path 
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 2H16A6 6 0 0 1 22 8V16A6 6 0 0 1 16 22H2V8A6 6 0 0 1 8 2ZM17 9H7A1 1 0 0 0 7 11H17A1 1 0 0 0 17 9ZM13 13H7A1 1 0 0 0 7 15H13A1 1 0 0 0 13 13Z" 
      />
    </svg>
  );
}

export function MessagingWidget() {
  const { activeCompany } = useCompany();
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const store = useMessagingStore();

  const threads = companyId ? store.getThreads(companyId) : [];
  const unreadCount = companyId ? store.getUnreadCount(companyId) : 0;
  const activeThread = threads.find((t) => t.id === store.activeThreadId) ?? null;

  const [composerText, setComposerText] = useState("");
  const [selectedTag, setSelectedTag] = useState<ChatThreadTag | null>(null);
  const [showTagError, setShowTagError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Movable / draggable widget position (stored as right/bottom offsets in px so it adapts cleanly to viewport resizes)
  const [offset, setOffset] = useState<{ right: number; bottom: number }>({
    right: 24,
    bottom: 24,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("villeto_chat_widget_offset");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.right === "number" && typeof parsed?.bottom === "number") {
          const maxRight = Math.max(16, window.innerWidth - 72);
          const maxBottom = Math.max(16, window.innerHeight - 72);
          setOffset({
            right: Math.min(maxRight, Math.max(12, parsed.right)),
            bottom: Math.min(maxBottom, Math.max(12, parsed.bottom)),
          });
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Only drag with primary mouse button or touch
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: offset.right,
      startBottom: offset.bottom,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragRef.current.moved = true;
      setIsDragging(true);
    }
    if (!dragRef.current.moved) return;

    const maxRight = Math.max(12, window.innerWidth - 68);
    const maxBottom = Math.max(12, window.innerHeight - 68);
    const nextRight = Math.min(maxRight, Math.max(12, dragRef.current.startRight - dx));
    const nextBottom = Math.min(maxBottom, Math.max(12, dragRef.current.startBottom - dy));
    setOffset({ right: nextRight, bottom: nextBottom });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>, onClickAction?: () => void) => {
    if (!dragRef.current) return;
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
    if (wasMoved) {
      try {
        localStorage.setItem("villeto_chat_widget_offset", JSON.stringify(offset));
      } catch {
        // Ignore storage errors
      }
    } else if (onClickAction) {
      onClickAction();
    }
  };

  // Available "attach this message to" tags — real POs/invoices for this
  // company plus a fixed "General" option. No fabricated "Delivery
  // Confirmation" tags since that's not a real backend entity here.
  const { data: orders = [] } = useQuery({
    queryKey: queryKeys.orders(companyId ?? "", { limit: 10 }),
    queryFn: () => getOrders({ limit: 10 }),
    enabled: !!companyId && store.isOpen,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: queryKeys.invoices(companyId ?? "", { limit: 10 }),
    queryFn: () => getInvoices({ limit: 10 }),
    enabled: !!companyId && store.isOpen,
  });

  const availableTags: ChatThreadTag[] = useMemo(() => {
    const orderTags: ChatThreadTag[] = orders.map((o) => ({
      id: o.purchaseOrderId,
      type: "purchase_order",
      label: o.poNumber,
    }));
    const invoiceTags: ChatThreadTag[] = invoices.map((i) => ({
      id: i.vendorInvoiceId,
      type: "invoice",
      label: i.invoiceNumber,
    }));
    return [...orderTags, ...invoiceTags, GENERAL_TAG];
  }, [orders, invoices]);

  useEffect(() => {
    if (companyId) store.ensureCompanySeeded(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages.length]);

  if (!companyId) return null;

  const handleOpenThread = (threadId: string) => {
    store.openThread(threadId);
    store.markThreadRead(companyId, threadId);
  };

  const handleStartNewConversation = () => {
    setSelectedTag(null);
    setShowTagError(false);
    setComposerText("");
    store.showNewConversation();
  };

  const handleSendNew = () => {
    if (!selectedTag) {
      setShowTagError(true);
      return;
    }
    if (!composerText.trim()) return;
    const threadId = store.createThread(companyId, activeCompany?.companyName ?? "", selectedTag, composerText.trim());
    setComposerText("");
    store.openThread(threadId);
  };

  const handleSendReply = () => {
    if (!activeThread || !composerText.trim()) return;
    store.sendMessage(companyId, activeThread.id, composerText.trim());
    setComposerText("");
  };

  return (
    <>
      {/* Draggable Launcher Bubble */}
      {!store.isOpen && (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => handlePointerUp(e, store.open)}
          style={{
            right: `${offset.right}px`,
            bottom: `${offset.bottom}px`,
            touchAction: "none",
          }}
          title="Drag to move · Click to open messages"
          aria-label={unreadCount > 0 ? `Open messages, ${unreadCount} unread` : "Open messages"}
          className={cn(
            "fixed z-40 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors select-none",
            isDragging ? "cursor-grabbing scale-105 shadow-2xl" : "cursor-grab"
          )}
        >
          <ChatWidgetIcon className="h-5 w-5 sm:h-6 sm:w-6 pointer-events-none" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none border-2 border-white pointer-events-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel (anchored to movable offset on desktop) */}
      {store.isOpen && (
        <div
          style={{
            right: `${Math.min(Math.max(12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 396), offset.right)}px`,
            bottom: `${Math.min(Math.max(12, (typeof window !== "undefined" ? window.innerHeight : 800) - 576), offset.bottom)}px`,
          }}
          className={cn(
            "fixed z-40 bg-white flex flex-col shadow-xl border border-border overflow-hidden",
            "inset-0 sm:inset-auto sm:h-[560px] sm:w-[380px] sm:rounded-2xl"
          )}
        >
          {/* Desktop Drag Handle Bar for Open Chat Panel */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerUp(e)}
            style={{ touchAction: "none" }}
            title="Drag to move chat panel"
            className={cn(
              "hidden sm:flex items-center justify-center py-1.5 bg-slate-50 border-b border-border/60 shrink-0 select-none",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
          >
            <span className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          {store.view === "conversation" && activeThread ? (
            <ConversationView
              companyName={activeCompany?.companyName ?? "Company"}
              tag={activeThread.tag}
              messages={activeThread.messages}
              composerText={composerText}
              onComposerChange={setComposerText}
              onSend={handleSendReply}
              onBack={store.showList}
              onClose={store.close}
              messagesEndRef={messagesEndRef}
            />
          ) : store.view === "new" ? (
            <NewConversationView
              availableTags={availableTags}
              selectedTag={selectedTag}
              onSelectTag={(tag) => {
                setSelectedTag(tag);
                setShowTagError(false);
              }}
              showTagError={showTagError}
              composerText={composerText}
              onComposerChange={setComposerText}
              onSend={handleSendNew}
              onBack={threads.length > 0 ? store.showList : store.close}
            />
          ) : (
            <ThreadListView
              companyName={activeCompany?.companyName ?? "Company"}
              threads={threads}
              onOpenThread={handleOpenThread}
              onStartNew={handleStartNewConversation}
              onClose={store.close}
            />
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// THREAD LIST
// ─────────────────────────────────────────────

function ThreadListView({
  companyName,
  threads,
  onOpenThread,
  onStartNew,
  onClose,
}: {
  companyName: string;
  threads: ReturnType<typeof useMessagingStore.getState>["threadsByCompany"][string];
  onOpenThread: (id: string) => void;
  onStartNew: () => void;
  onClose: () => void;
}) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader companyName={companyName} subtitle="Chat with the company directly" onClose={onClose} />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Send your first message</p>
          <button
            type="button"
            onClick={onStartNew}
            className="mt-1 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Start a conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader companyName={companyName} subtitle="Chat with the company directly" onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const lastMessage = thread.messages[thread.messages.length - 1];
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onOpenThread(thread.id)}
              className="w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors flex gap-3 items-start cursor-pointer"
            >
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                {thread.tag.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{thread.tag.label}</p>
                  {lastMessage && (
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatRelativeTime(lastMessage.sentAt)}</span>
                  )}
                </div>
                {lastMessage && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{lastMessage.body}</p>
                )}
              </div>
              {thread.unreadCount > 0 && (
                <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
              )}
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-border shrink-0">
        <button
          type="button"
          onClick={onStartNew}
          className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Start a new conversation
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NEW CONVERSATION
// ─────────────────────────────────────────────

function NewConversationView({
  availableTags,
  selectedTag,
  onSelectTag,
  showTagError,
  composerText,
  onComposerChange,
  onSend,
  onBack,
}: {
  availableTags: ChatThreadTag[];
  selectedTag: ChatThreadTag | null;
  onSelectTag: (tag: ChatThreadTag) => void;
  showTagError: boolean;
  composerText: string;
  onComposerChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border shrink-0">
        <button type="button" onClick={onBack} aria-label="Back" className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold flex-1">New conversation</span>
      </div>

      <div className="px-4 py-4 border-b border-border shrink-0">
        <p className="text-sm font-medium text-foreground">Attach this message to</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">Select a thread to help properly classify messages</p>
        <div className="flex flex-wrap gap-2">
          {availableTags.length === 0 ? (
            <span className="text-xs text-muted-foreground">No orders or invoices yet — you can still send a General message.</span>
          ) : (
            availableTags.map((tag) => (
              <button
                key={`${tag.type}-${tag.id}`}
                type="button"
                onClick={() => onSelectTag(tag)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                  selectedTag?.id === tag.id
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-foreground border-border hover:bg-muted"
                )}
              >
                {tag.label}
              </button>
            ))
          )}
        </div>
        {showTagError && (
          <p className="text-xs text-red-500 mt-2">Please select a thread to attach this message to.</p>
        )}
      </div>

      <div className="flex-1" />

      <ComposerBar value={composerText} onChange={onComposerChange} onSend={onSend} />
    </div>
  );
}

// ─────────────────────────────────────────────
// CONVERSATION
// ─────────────────────────────────────────────

function ConversationView({
  companyName,
  tag,
  messages,
  composerText,
  onComposerChange,
  onSend,
  onBack,
  onClose,
  messagesEndRef,
}: {
  companyName: string;
  tag: ChatThreadTag;
  messages: ReturnType<typeof useMessagingStore.getState>["threadsByCompany"][string][number]["messages"];
  composerText: string;
  onComposerChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
  onClose: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border shrink-0">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{tag.label}</p>
          <p className="text-xs text-muted-foreground truncate">Chat with {companyName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close messages" className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0 cursor-pointer">
          <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.senderType === "vendor" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.senderType === "vendor" ? "bg-navy text-navy-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
              )}
            >
              {m.senderType !== "vendor" && (
                <p className="text-[11px] font-semibold opacity-70 mb-0.5">{m.senderName}</p>
              )}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={cn("text-[10px] mt-1", m.senderType === "vendor" ? "text-white/50" : "text-muted-foreground")}>
                {formatRelativeTime(m.sentAt)}
              </p>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Replies from {companyName} will appear here once messaging is connected.
        </p>
        <div ref={messagesEndRef} />
      </div>

      <ComposerBar value={composerText} onChange={onComposerChange} onSend={onSend} />
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED PIECES
// ─────────────────────────────────────────────

function PanelHeader({ companyName, subtitle, onClose }: { companyName: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border shrink-0">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
        {getInitials(companyName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{companyName}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close messages" className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0 cursor-pointer">
        <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>
    </div>
  );
}

function ComposerBar({ value, onChange, onSend }: { value: string; onChange: (v: string) => void; onSend: () => void }) {
  return (
    <div className="p-3 border-t border-border shrink-0">
      <div className="flex items-end gap-2">
        <label htmlFor="message-composer" className="sr-only">Type a message</label>
        <textarea
          id="message-composer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Type here..."
          rows={1}
          className="flex-1 resize-none text-sm border border-border rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary max-h-24"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Send message"
          className="h-9 w-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
