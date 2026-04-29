import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  OrderStatus,
  OrderPriority,
  InvoiceStatus,
  VendorStatus,
} from "@/lib/types";

// ─────────────────────────────────────────────
// TAILWIND MERGE
// ─────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────
// STATUS HELPERS
// ─────────────────────────────────────────────

export function getOrderStatusConfig(status: OrderStatus) {
  const configs: Record<
    OrderStatus,
    { label: string; color: string; bg: string; border: string }
  > = {
    assigned: {
      label: "Assigned",
      color: "text-gray-600",
      bg: "bg-gray-100",
      border: "border-gray-200",
    },
    acknowledged: {
      label: "Acknowledged",
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    ready_for_delivery: {
      label: "Ready for delivery",
      color: "text-purple-700",
      bg: "bg-purple-50",
      border: "border-purple-200",
    },
    delivered: {
      label: "Delivered",
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
    },
    invoiced: {
      label: "Invoiced",
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  };
  return configs[status] ?? configs.assigned;
}

export function getOrderPriorityConfig(priority: OrderPriority) {
  const configs: Record<
    OrderPriority,
    { label: string; color: string; bg: string }
  > = {
    low: { label: "Low", color: "text-green-700", bg: "bg-green-50" },
    medium: { label: "Medium", color: "text-amber-700", bg: "bg-amber-50" },
    urgent: { label: "Urgent", color: "text-red-700", bg: "bg-red-50" },
  };
  return configs[priority] ?? configs.low;
}

export function getInvoiceStatusConfig(status: InvoiceStatus) {
  const configs: Record<
    InvoiceStatus,
    { label: string; color: string; bg: string; border: string }
  > = {
    draft: {
      label: "Draft",
      color: "text-gray-600",
      bg: "bg-gray-100",
      border: "border-gray-200",
    },
    pending: {
      label: "Pending",
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    under_review: {
      label: "Under Review",
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
    flagged: {
      label: "Flagged",
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-200",
    },
    approved: {
      label: "Approved",
      color: "text-purple-700",
      bg: "bg-purple-50",
      border: "border-purple-200",
    },
    paid: {
      label: "Paid",
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
    },
  };
  return configs[status] ?? configs.draft;
}

export function getVendorStatusConfig(status: VendorStatus) {
  const configs: Record<
    VendorStatus,
    { label: string; color: string; bg: string }
  > = {
    draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
    invited: { label: "Invited", color: "text-blue-700", bg: "bg-blue-50" },
    pending_approval: {
      label: "Pending Approval",
      color: "text-amber-700",
      bg: "bg-amber-50",
    },
    verified: {
      label: "Verified",
      color: "text-teal-700",
      bg: "bg-teal-50",
    },
    active: {
      label: "Active",
      color: "text-green-700",
      bg: "bg-green-50",
    },
    flagged: {
      label: "Flagged",
      color: "text-red-700",
      bg: "bg-red-50",
    },
    rejected: {
      label: "Rejected",
      color: "text-red-700",
      bg: "bg-red-100",
    },
  };
  return configs[status] ?? configs.draft;
}

// ─────────────────────────────────────────────
// CURRENCY FORMATTING
// ─────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency: string = "NGN"
): string {
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

// ─────────────────────────────────────────────
// DATE FORMATTING
// ─────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────
// FUZZY NAME MATCH
// ─────────────────────────────────────────────

/**
 * Simple fuzzy match score between two strings (0–100).
 * Used for business name vs bank account name comparison.
 */
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

  // Levenshtein-based similarity
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
