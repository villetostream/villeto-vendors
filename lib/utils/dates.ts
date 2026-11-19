export function parseLocalDate(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toIsoDateString(dateStr?: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? "" : formatLocalIsoDate(parsed);
}

export function isPastCalendarDate(
  dateStr?: string | null,
  referenceDate: Date = new Date()
): boolean {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return false;
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const candidateStart = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  return candidateStart < todayStart;
}

/**
 * Resolves the initial promise date when acknowledging a PO line item.
 * Leaves the value blank if the expected due date is already in the past.
 */
export function resolveAcknowledgePromiseDate(
  itemDeliveryDate?: string | null,
  orderDeliveryDate?: string | null,
  referenceDate: Date = new Date()
): string {
  const expectedDate =
    toIsoDateString(itemDeliveryDate) || toIsoDateString(orderDeliveryDate);

  if (expectedDate) {
    return isPastCalendarDate(expectedDate, referenceDate) ? "" : expectedDate;
  }

  return formatLocalIsoDate(referenceDate);
}
