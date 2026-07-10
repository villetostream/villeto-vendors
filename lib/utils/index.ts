import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  OrderStatus,
  OrderPriority,
  InvoiceStatus,
  InvoicePaymentStatus,
  ORDER_STATUS_DISPLAY_LABEL,
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
    delivered: { label: "Delivered", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
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

export function getCompanyStatusConfig(rawStatus: string, approvalStatus?: string) {
  const status = normalizeStatus(rawStatus);
  const approval = normalizeStatus(approvalStatus);

  if (approval === "rejected") {
    return { label: "Rejected", color: "text-red-700", bg: "bg-red-50" };
  }
  if (status === "active") {
    return { label: "Active", color: "text-green-700", bg: "bg-green-50" };
  }
  if (approval === "approved" && status !== "active") {
    return { label: "Setting up payments", color: "text-amber-700", bg: "bg-amber-50" };
  }
  if (status === "suspended") {
    return { label: "Suspended", color: "text-orange-700", bg: "bg-orange-50" };
  }
  if (status === "deactivated" || status === "banned") {
    return { label: "Access removed", color: "text-red-700", bg: "bg-red-50" };
  }
  return { label: "Under review", color: "text-amber-700", bg: "bg-amber-50" };
}

// ─────────────────────────────────────────────
// CURRENCY FORMATTING
// ─────────────────────────────────────────────

export function formatCurrency(amount: number, currency: string = "NGN"): string {
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

export function getInitials(name: string): string {
  return name
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
