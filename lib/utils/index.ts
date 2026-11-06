import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  OrderStatus,
  OrderPriority,
  InvoiceStatus,
  InvoicePaymentStatus,
  ORDER_STATUS_DISPLAY_LABEL,
  Fulfillment,
  FulfillmentExceptionDetail,
} from "@/lib/types";

// ─────────────────────────────────────────────
// TAILWIND MERGE
// ─────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────
// STATUS NORMALIZATION
// Backend returns inconsistent casing across endpoints ("Inactive" on
// /vendors/me/companies and /vendor-portal/profile, lowercase elsewhere).
// Flagged with backend as a fix-later item — until then, every comparison
// against vendor `status` MUST go through these helpers, never a raw
// `=== "active"` string check.
// ─────────────────────────────────────────────

export function normalizeStatus(status?: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

export function isStatusActive(status?: string | null): boolean {
  return normalizeStatus(status) === "active";
}

/**
 * Parses a single exception/rejection reason segment.
 */
function parseSingleReason(str: string): { category: string | null; text: string } {
  const trimmed = str.trim();
  if (!trimmed) return { category: null, text: "" };

  // Case 1: "Other (specify below): <detail>" or "Other: <detail>"
  const otherMatch = trimmed.match(/^other\s*(?:\([^)]*\))?\s*:\s*(.*)$/i);
  if (otherMatch) {
    const detail = otherMatch[1].trim();
    return {
      category: null,
      text: detail && detail.toLowerCase() !== "other" ? detail : "Other",
    };
  }

  // Case 2: "<Category Name>: <Detail>"
  // Restrict category to 2-45 chars without delimiters like '·', '\n'
  const categoryMatch = trimmed.match(/^([^:.·\n]{2,45}):\s+(.+)$/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const detail = categoryMatch[2].trim();
    // If the detail is identical to category, don't repeat it
    if (detail.toLowerCase() === cat.toLowerCase()) {
      return { category: cat, text: "" };
    }
    return {
      category: cat,
      text: detail,
    };
  }

  return { category: null, text: trimmed };
}

/**
 * Parses a raw buyer exception/rejection reason string.
 *
 * Automatically handles:
 * - Deduplication of repeated reasons sent from company side (e.g. repeated per line item).
 * - Delimiters like ' · ', ' - ', ';', and newlines.
 * - Merging of notes that lack a category with line items that have a category for the same text.
 * - Stripping of form prompts like "Other (specify below):".
 */
export function parseExceptionReason(raw?: string | null): {
  category: string | null;
  categories: string[];
  text: string;
} {
  if (!raw || !raw.trim()) {
    return { category: null, categories: [], text: "" };
  }

  // Split on common concatenation delimiters: ' · ', ' • ', ' - ', '; ', or newlines
  const rawSegments = raw
    .split(/\s*[·•]\s*|\s+-\s+|;\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSegments.length === 0) {
    return { category: null, categories: [], text: "" };
  }

  // Parse each segment
  const parsedSegments = rawSegments.map(parseSingleReason);

  // Group and deduplicate by normalized text and category
  // Map normalized text -> preferred category and display text
  const textToCategoryMap = new Map<string, { category: string | null; displayText: string }>();
  const standaloneCategories = new Set<string>();

  for (const seg of parsedSegments) {
    const normText = seg.text.toLowerCase().trim();

    if (!normText && seg.category) {
      standaloneCategories.add(seg.category);
      continue;
    }

    if (!normText) continue;

    const existing = textToCategoryMap.get(normText);
    if (!existing) {
      textToCategoryMap.set(normText, {
        category: seg.category,
        displayText: seg.text,
      });
    } else if (!existing.category && seg.category) {
      // Category-enriched entry takes precedence over bare text
      existing.category = seg.category;
    }
  }

  // Collect unique categories and unique text items
  const uniqueCategories: string[] = [];
  const categorySet = new Set<string>();

  for (const cat of standaloneCategories) {
    const norm = cat.toLowerCase();
    if (!categorySet.has(norm)) {
      categorySet.add(norm);
      uniqueCategories.push(cat);
    }
  }

  const uniqueTexts: string[] = [];
  for (const [, item] of textToCategoryMap) {
    if (item.category) {
      const normCat = item.category.toLowerCase();
      if (!categorySet.has(normCat)) {
        categorySet.add(normCat);
        uniqueCategories.push(item.category);
      }
    }
    // Only add to text if it's not identical to an extracted category
    if (item.displayText && !categorySet.has(item.displayText.toLowerCase())) {
      uniqueTexts.push(item.displayText);
    }
  }

  const primaryCategory = uniqueCategories.length > 0 ? uniqueCategories.join(", ") : null;
  const primaryText = uniqueTexts.join(" · ");

  return {
    category: primaryCategory,
    categories: uniqueCategories,
    text: primaryText,
  };
}

export function formatExceptionReason(raw?: string | null): string {
  const { category, text } = parseExceptionReason(raw);
  if (category && text) {
    return `${category} — ${text}`;
  }
  return category || text;
}

export function getUniqueLineReasons(
  lineItems?: Array<{ exceptionReason?: string | null; rejectionReason?: string | null }>
): string {
  if (!lineItems || lineItems.length === 0) return "";
  return Array.from(
    new Set(
      lineItems
        .map((li) => (li.exceptionReason || li.rejectionReason)?.trim())
        .filter(Boolean)
    )
  ).join(" · ");
}

/**
 * Merges receipt exception details from GET /vendor-portal/fulfillment-exceptions/:deliveryReceiptId
 * (or embedded order receipts / receiptConfirmations) onto the order's fulfillments so the UI has full
 * receipt-level and line-level exception and resolution fields (including finalQuantityAccepted).
 */
export function enrichFulfillmentsWithReceipts(
  fulfillments: Fulfillment[],
  rawReceipts: FulfillmentExceptionDetail[]
): Fulfillment[] {
  if (!rawReceipts || rawReceipts.length === 0) {
    return fulfillments.map((f) => ({
      ...f,
      rejectionReason: f.rejectionReason || getUniqueLineReasons(f.lineItems) || undefined,
    }));
  }

  // Deduplicate receipts by deliveryReceiptId (prefer later entries or higher decisionVersion)
  const receiptMap = new Map<string, FulfillmentExceptionDetail>();
  for (const r of rawReceipts) {
    if (!r?.deliveryReceiptId) continue;
    const existing = receiptMap.get(r.deliveryReceiptId);
    if (
      !existing ||
      (r.decisionVersion ?? 0) >= (existing.decisionVersion ?? 0)
    ) {
      receiptMap.set(r.deliveryReceiptId, { ...existing, ...r });
    }
  }
  const receipts = Array.from(receiptMap.values());

  const matchedReceiptIds = new Set<string>();

  const enriched = fulfillments.map((f) => {
    const matchedReceipt = receipts.find(
      (r) =>
        (r.deliveryReceiptId && r.deliveryReceiptId === f.deliveryReceiptId) ||
        (r.fulfillmentId &&
          (r.fulfillmentId === f.vendorDeliveryNoticeId || r.fulfillmentId === f.fulfillmentId)) ||
        (r.fulfillmentReference &&
          (r.fulfillmentReference === f.fulfillmentReference ||
            r.fulfillmentReference === f.shipmentReference)) ||
        (r.receiptNumber && f.receiptNumber && r.receiptNumber === f.receiptNumber)
    );

    if (!matchedReceipt) {
      return {
        ...f,
        rejectionReason: f.rejectionReason || getUniqueLineReasons(f.lineItems) || undefined,
      };
    }
    matchedReceiptIds.add(matchedReceipt.deliveryReceiptId);

    const mergedLineItems = f.lineItems.map((li) => {
      const rLi = matchedReceipt.lineItems?.find(
        (item) =>
          (item.purchaseOrderLineItemId && item.purchaseOrderLineItemId === li.purchaseOrderLineItemId) ||
          (item.fulfillmentLineItemId &&
            (item.fulfillmentLineItemId === li.vendorDeliveryNoticeLineItemId ||
              item.fulfillmentLineItemId === li.fulfillmentLineItemId))
      );
      if (!rLi) return li;

      // Handle dispute acceptance resolution: if dispute was accepted, ensure accepted quantity reflects that
      const resolvedAccepted =
        rLi.finalQuantityAccepted ??
        (matchedReceipt.finalDecision === "accept_vendor_dispute"
          ? (rLi.quantityOrdered ?? rLi.quantityReceived ?? rLi.quantityAccepted)
          : rLi.quantityAccepted);

      return {
        ...li,
        deliveryReceiptLineItemId: rLi.deliveryReceiptLineItemId ?? li.deliveryReceiptLineItemId,
        quantityReceived: rLi.quantityReceived ?? li.quantityReceived,
        quantityAccepted: rLi.quantityAccepted ?? li.quantityAccepted,
        quantityRejected: rLi.quantityRejected ?? li.quantityRejected,
        quantityMissing: rLi.quantityMissing ?? li.quantityMissing,
        exceptionReason: rLi.exceptionReason ?? li.exceptionReason,
        rejectionReason: rLi.exceptionReason ?? li.rejectionReason,
        finalQuantityAccepted: resolvedAccepted ?? rLi.finalQuantityAccepted ?? li.finalQuantityAccepted,
        finalQuantityRejected: rLi.finalQuantityRejected ?? li.finalQuantityRejected,
        finalQuantityMissing: rLi.finalQuantityMissing ?? li.finalQuantityMissing,
        resolutionStatus: rLi.resolutionStatus ?? matchedReceipt.resolutionStatus ?? li.resolutionStatus,
        vendorDisposition: rLi.vendorDisposition ?? matchedReceipt.vendorDisposition ?? li.vendorDisposition,
        expectedRedeliveryDate: rLi.expectedRedeliveryDate ?? matchedReceipt.expectedRedeliveryDate ?? li.expectedRedeliveryDate,
        vendorResponseReason: rLi.vendorResponseReason ?? matchedReceipt.vendorResponseReason ?? li.vendorResponseReason,
      };
    });

    const lineReasons = Array.from(
      new Set(
        (matchedReceipt.lineItems || [])
          .map((item) => item.exceptionReason?.trim())
          .filter(Boolean)
      )
    ).join(" · ");

    return {
      ...f,
      deliveryReceiptId: matchedReceipt.deliveryReceiptId || f.deliveryReceiptId,
      receiptNumber: matchedReceipt.receiptNumber || matchedReceipt.receiptReference || f.receiptNumber,
      confirmationOutcome: matchedReceipt.confirmationOutcome ?? f.confirmationOutcome,
      inspectionOutcome: (matchedReceipt.inspectionOutcome ?? f.inspectionOutcome) as any,
      resolutionStatus: matchedReceipt.resolutionStatus ?? f.resolutionStatus,
      vendorActionRequired: matchedReceipt.vendorActionRequired,
      companyActionRequired: matchedReceipt.companyActionRequired,
      vendorDisposition: matchedReceipt.vendorDisposition ?? f.vendorDisposition,
      expectedRedeliveryDate: matchedReceipt.expectedRedeliveryDate ?? f.expectedRedeliveryDate,
      vendorResponseReason: matchedReceipt.vendorResponseReason ?? f.vendorResponseReason,
      finalDecision: matchedReceipt.finalDecision ?? f.finalDecision,
      decisionVersion: matchedReceipt.decisionVersion ?? f.decisionVersion,
      decisionHistory: matchedReceipt.decisionHistory ?? f.decisionHistory,
      resolutionNote: matchedReceipt.resolutionNote ?? f.resolutionNote,
      resolvedAt: matchedReceipt.resolvedAt ?? f.resolvedAt,
      resolvedByName: matchedReceipt.resolvedByName ?? f.resolvedByName,
      evidence: matchedReceipt.evidence ?? f.evidence,
      vendorEvidence: matchedReceipt.vendorEvidence ?? f.vendorEvidence,
      rejectionReason:
        matchedReceipt.notes && lineReasons && !matchedReceipt.notes.includes(lineReasons) && !lineReasons.includes(matchedReceipt.notes)
          ? `${matchedReceipt.notes} · ${lineReasons}`
          : matchedReceipt.notes || lineReasons || f.rejectionReason,
      lineItems: mergedLineItems,
    };
  });

  // Append any receipt exceptions that did not match an existing fulfillment entry
  const unmatchedReceipts: Fulfillment[] = receipts
    .filter((r) => !matchedReceiptIds.has(r.deliveryReceiptId))
    .map((r) => {
      const lineReasons = Array.from(
        new Set(
          (r.lineItems || [])
            .map((item) => item.exceptionReason?.trim())
            .filter(Boolean)
        )
      ).join(" · ");

      return {
        vendorDeliveryNoticeId: r.fulfillmentId || r.deliveryReceiptId,
        fulfillmentId: r.fulfillmentId,
        deliveryReceiptId: r.deliveryReceiptId,
        receiptNumber: r.receiptNumber || r.receiptReference,
        shipmentReference: r.fulfillmentReference || r.receiptNumber,
        fulfillmentReference: r.fulfillmentReference,
        status: "submitted",
        shippedAt: r.receivedAt || new Date().toISOString(),
        readyAt: r.receivedAt,
        dispatchStatus: "dispatched",
        notes: r.notes,
        isPartial: false,
        confirmationOutcome: r.confirmationOutcome,
        inspectionOutcome: r.inspectionOutcome as any,
        resolutionStatus: r.resolutionStatus,
        vendorActionRequired: r.vendorActionRequired,
        companyActionRequired: r.companyActionRequired,
        vendorDisposition: r.vendorDisposition,
        expectedRedeliveryDate: r.expectedRedeliveryDate,
        vendorResponseReason: r.vendorResponseReason,
        finalDecision: r.finalDecision,
        decisionVersion: r.decisionVersion,
        decisionHistory: r.decisionHistory,
        resolutionNote: r.resolutionNote,
        resolvedAt: r.resolvedAt,
        resolvedByName: r.resolvedByName,
        evidence: r.evidence,
        vendorEvidence: r.vendorEvidence,
        rejectionReason: r.notes || lineReasons,
        lineItems: (r.lineItems || []).map((li) => ({
          vendorDeliveryNoticeLineItemId:
            li.fulfillmentLineItemId || li.deliveryReceiptLineItemId,
          deliveryReceiptLineItemId: li.deliveryReceiptLineItemId,
          fulfillmentLineItemId: li.fulfillmentLineItemId,
          purchaseOrderLineItemId: li.purchaseOrderLineItemId,
          name: li.name,
          quantityOrdered: li.quantityOrdered,
          quantityShipped:
            (li.quantityAccepted || 0) + (li.quantityRejected || 0) + (li.quantityMissing || 0) ||
            li.quantityReceived,
          quantityReady:
            (li.quantityAccepted || 0) + (li.quantityRejected || 0) + (li.quantityMissing || 0) ||
            li.quantityReceived,
          quantityReceived: li.quantityReceived,
          quantityAccepted: li.quantityAccepted,
          quantityRejected: li.quantityRejected,
          quantityMissing: li.quantityMissing,
          exceptionReason: li.exceptionReason,
          rejectionReason: li.exceptionReason || undefined,
          finalQuantityAccepted: li.finalQuantityAccepted,
          finalQuantityRejected: li.finalQuantityRejected,
          finalQuantityMissing: li.finalQuantityMissing,
          resolutionStatus: li.resolutionStatus,
          vendorDisposition: li.vendorDisposition,
          expectedRedeliveryDate: li.expectedRedeliveryDate,
          vendorResponseReason: li.vendorResponseReason,
        })),
      };
    });

  return [...enriched, ...unmatchedReceipts];
}

// ─────────────────────────────────────────────
// STATUS HELPERS — PURCHASE ORDERS
// ─────────────────────────────────────────────

export function getOrderStatusConfig(status: OrderStatus) {
  const configs: Record<
    OrderStatus,
    { label: string; color: string; bg: string; border: string }
  > = {
    draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-200" },
    issued: { label: "Issued", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
    acknowledged: { label: "Acknowledged", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
    ready_for_delivery: { label: "Ready for delivery", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
    partially_delivered: { label: "Partially delivered", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
    partially_delivered_with_exceptions: {
      label: "Partially delivered (Exceptions)",
      color: "text-amber-800",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    delivered: { label: "Delivered", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
    delivered_with_exceptions: {
      label: "Delivered (Exceptions)",
      color: "text-amber-800",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    closed: { label: "Closed", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
    // Display copy only — backend value/status filter param stays "cancelled".
    cancelled: { label: ORDER_STATUS_DISPLAY_LABEL.cancelled, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  };
  return configs[status] ?? configs.draft;
}

export function getOrderPriorityConfig(priority: OrderPriority) {
  const configs: Record<OrderPriority, { label: string; color: string; bg: string }> = {
    low: { label: "Low", color: "text-green-700", bg: "bg-green-50" },
    medium: { label: "Medium", color: "text-amber-700", bg: "bg-amber-50" },
    urgent: { label: "Urgent", color: "text-red-700", bg: "bg-red-50" },
  };
  return configs[priority] ?? configs.low;
}

// ─────────────────────────────────────────────
// STATUS HELPERS — INVOICES
// ─────────────────────────────────────────────

export function getInvoiceStatusConfig(status: InvoiceStatus) {
  const configs: Record<
    InvoiceStatus,
    { label: string; color: string; bg: string; border: string }
  > = {
    submitted: { label: "Submitted", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
    under_review: { label: "Under Review", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
    approved: { label: "Approved", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
    rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
    paid: { label: "Paid", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  };
  return configs[status] ?? configs.submitted;
}

export function getInvoicePaymentStatusConfig(status: InvoicePaymentStatus) {
  const configs: Record<InvoicePaymentStatus, { label: string; color: string; bg: string }> = {
    pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100" },
    in_progress: { label: "In Progress", color: "text-amber-700", bg: "bg-amber-50" },
    paid: { label: "Paid", color: "text-green-700", bg: "bg-green-50" },
    failed: { label: "Failed", color: "text-red-700", bg: "bg-red-50" },
  };
  return configs[status] ?? configs.pending;
}

// ─────────────────────────────────────────────
// STATUS HELPERS — VENDOR / COMPANY RELATIONSHIP
// Vendor-facing copy deliberately avoids "banned" — see conversation notes.
// A tenant-removed relationship reads as "Access removed", never "Banned".
// ─────────────────────────────────────────────

/**
 * True once the vendor has actually submitted onboarding for the active
 * company. A just-accepted invitation (approvalStatus null, onboardingStatus
 * "invited" / "profile_review" / "in_progress") is NOT submitted — the vendor
 * must go through the wizard instead of landing on /pending.
 */
export function hasSubmittedOnboarding(user?: {
  approvalStatus?: string | null;
  onboardingStatus?: string | null;
} | null): boolean {
  if (!user) return false;
  if (user.approvalStatus) return true;
  const s = (user.onboardingStatus ?? "").toLowerCase();
  return ["submitted", "under_review", "pending_approval", "completed"].includes(s);
}

export function getCompanyStatusConfig(
  rawStatus: string, 
  approvalStatus?: string | null, 
  nextAction?: string | null,
  onboardingStatus?: string | null,
  paymentTermStatus?: string | null
) {
  const status = normalizeStatus(rawStatus);
  const approval = normalizeStatus(approvalStatus);
  const onboarding = (onboardingStatus ?? "").toLowerCase().trim();
  const next = (nextAction ?? "").toLowerCase().trim();
  const paymentTerm = (paymentTermStatus ?? "").toLowerCase().trim();

  const isAwaitingReview =
    onboarding === "submitted" ||
    next === "awaiting_company_review" ||
    approval === "pending" ||
    approval === "under_review";

  if (status === "active") {
    return { label: "Active", color: "text-green-700", bg: "bg-green-50" };
  }
  if (paymentTerm === "rejected") {
    return { label: "Payment terms rejected", color: "text-red-700", bg: "bg-red-50" };
  }
  if (approval === "approved" && status !== "active") {
    return { label: "Setting up payments", color: "text-amber-700", bg: "bg-amber-50" };
  }
  if (approval === "rejected" && isAwaitingReview) {
    return { label: "Under review", color: "text-amber-700", bg: "bg-amber-50" };
  }
  if (approval === "rejected" || status === "rejected") {
    return { label: "Rejected", color: "text-red-700", bg: "bg-red-50" };
  }
  if (isAwaitingReview) {
    return { label: "Under review", color: "text-amber-700", bg: "bg-amber-50" };
  }
  if (status === "suspended") {
    return { label: "Suspended", color: "text-orange-700", bg: "bg-orange-50" };
  }
  if (status === "deactivated" || status === "banned") {
    return { label: "Access removed", color: "text-red-700", bg: "bg-red-50" };
  }
  if (approval === "pending") {
    return { label: "Under review", color: "text-amber-700", bg: "bg-amber-50" };
  }
  if (
    status === "invited" || 
    rawStatus.toLowerCase() === "invited" || 
    nextAction === "accept_invitation" ||
    onboardingStatus === "invited"
  ) {
    return { label: "Invitation Pending", color: "text-orange-700", bg: "bg-orange-50" };
  }
  return { label: "Action required", color: "text-blue-700", bg: "bg-blue-50" };
}

// ─────────────────────────────────────────────
// CURRENCY FORMATTING
// ─────────────────────────────────────────────

export function formatCurrency(amount: number, currency: string): string {
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

// ─────────────────────────────────────────────
// DATE FORMATTING
// ─────────────────────────────────────────────

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Relative time for notification lists, e.g. "5m ago", "3d ago". */
export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

// ─────────────────────────────────────────────
// FUZZY NAME MATCH
// ─────────────────────────────────────────────

export function fuzzyMatchScore(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(ltd|limited|plc|inc|co|corp|llc|ng)\b/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 90;

  const len = Math.max(na.length, nb.length);
  if (len === 0) return 100;
  const dist = levenshtein(na, nb);
  return Math.round(((len - dist) / len) * 100);
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─────────────────────────────────────────────
// MISC
// ─────────────────────────────────────────────

export function getInitials(name?: string | null): string {
  return (name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(str: string, max: number = 30): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}
