"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Package,
  Truck,
  Monitor,
  Wrench,
  ClipboardCheck,
  Info,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getOrder, getOrders } from "@/lib/api/orders";
import { getInvoice, getInvoices } from "@/lib/api/invoices";
import { queryKeys, useCompanyStore } from "@/lib/stores/companyStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/Label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { Dialog, DialogContent } from "@/components/ui/Modal";
import { useCreateInvoice, useUpdateInvoice } from "@/lib/hooks/useInvoices";
import { useOrderFulfillmentExceptions } from "@/lib/hooks/useOrders";
import { formatCurrency, formatDate, formatDateTime, enrichFulfillmentsWithReceipts, cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { DatePicker } from "@/components/ui/DatePicker";
import { InvoiceLineItemInput, Order, OrderLineItem, Fulfillment, FulfillmentLineItem, FulfillmentExceptionDetail, CreateInvoicePayload } from "@/lib/types";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { useVendorPaymentTerms } from "@/lib/hooks/useVendorNetwork";

/**
 * Line item fields shown to a vendor. Deliberately excludes
 * categoryId, departmentId, the accounting-integration refs,
 * vendorSelectionMode, catalogVendorId, lockedVendorId, and
 * preferredVendorId from the raw backend schema — those are buyer-side
 * procurement/accounting concerns, not something a vendor fills in. See
 * lib/api/invoices.ts and InvoiceLineItemInput for the same note.
 */
interface FormLineItem extends InvoiceLineItemInput {
  _key: string;
  /** Max quantity the vendor is allowed to invoice for this line (buyer-confirmed minus already-invoiced) */
  _maxInvoiceable: number;
}

function generateKey() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyLineItem(): FormLineItem {
  return { _key: generateKey(), purchaseOrderLineItemId: "", name: "", description: "", quantity: 1, unitPrice: 0, taxAmount: 0, sku: "", unitOfMeasure: "", _maxInvoiceable: 0 };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateString(dateStr?: string | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, "yyyy-MM-dd");
    }
  } catch {
    // ignore
  }
  return null;
}

function parseLocalDate(dateStr?: string | null): Date | undefined {
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

/**
 * Automatically derives the most accurate delivery date for an invoice from the purchase order:
 * 1. Explicit order deliveredAt or deliveryDate
 * 2. Buyer receipt confirmation received date (when goods were actually confirmed)
 * 3. Latest fulfillment shipment / dispatch / expected delivery date
 * 4. Per-line delivery date agreed during order acknowledgment
 * 5. Fallback confirmation or shipment date
 * 6. Defaults to today's date if no historical dates are available
 */
function extractDeliveryDateFromOrder(
  po?: Order | null,
  fulfillmentsList?: Fulfillment[]
): string {
  if (!po) return todayISODate();

  // 1. Order-level actual delivered timestamp or target delivery date
  const explicit =
    normalizeDateString(po.deliveredAt) || normalizeDateString(po.deliveryDate);
  if (explicit) return explicit;

  // 2. Receipt confirmation received date (when buyer actually received/accepted the delivery)
  const receipts = (
    po.receiptConfirmations ||
    po.receipts ||
    po.deliveryReceipts ||
    []
  );
  if (receipts.length > 0) {
    const latestReceipt = [...receipts].reverse().find(
      (r) => r.receivedAt || (r as any).confirmedAt || (r as any).createdAt
    );
    const receiptDate = normalizeDateString(
      latestReceipt?.receivedAt ||
        (latestReceipt as any)?.confirmedAt ||
        (latestReceipt as any)?.createdAt
    );
    if (receiptDate) return receiptDate;
  }

  // 3. Latest fulfillment shipment / dispatch / expected date
  const fulfillments =
    fulfillmentsList && fulfillmentsList.length > 0
      ? fulfillmentsList
      : po.fulfillments || po.deliveryNotices || [];
  if (fulfillments.length > 0) {
    const latestFulfillment = [...fulfillments].reverse().find(
      (f) =>
        f.readyAt ||
        f.dispatchedAt ||
        f.shippedAt ||
        f.expectedDeliveryDate
    );
    const fDate = normalizeDateString(
      latestFulfillment?.readyAt ||
        latestFulfillment?.dispatchedAt ||
        latestFulfillment?.shippedAt ||
        latestFulfillment?.expectedDeliveryDate
    );
    if (fDate) return fDate;
  }

  // 4. Per-line delivery dates
  if (po.lineItems && po.lineItems.length > 0) {
    const lineWithDate = po.lineItems.find((li) => li.deliveryDate);
    const lineDate = normalizeDateString(lineWithDate?.deliveryDate);
    if (lineDate) return lineDate;
  }

  // 5. Fallback confirmation date or shipment date
  const fallback =
    normalizeDateString(po.confirmationDate) ||
    normalizeDateString(po.shipmentDate);
  if (fallback) return fallback;

  // 6. Default to today
  return todayISODate();
}

// ── Delivery & Receipt Overview ──────────────────────────────────────
// Shows vendors only the buyer-confirmed deliveries included in this invoice
// (collapsed by default to avoid scroll fatigue), and notes any unconfirmed
// or awaiting-dispatch shipments separately without cluttering the invoice.

function DeliveryReceiptOverview({
  purchaseOrderId,
  lineItems,
  fulfillments,
  alreadyInvoicedByLine,
}: {
  purchaseOrderId: string;
  lineItems: OrderLineItem[];
  fulfillments: Fulfillment[];
  alreadyInvoicedByLine: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (fulfillments.length === 0) return null;

  const methodLabel: Record<string, string> = {
    carrier: "Carrier",
    vendor_truck: "Vendor Truck",
    digital: "Digital",
    service: "Service",
  };

  const MethodIcon = ({ method }: { method: string }) => {
    if (method === "digital") return <Monitor className="h-3.5 w-3.5" />;
    if (method === "service") return <Wrench className="h-3.5 w-3.5" />;
    if (["carrier", "vendor_truck"].includes(method)) return <Truck className="h-3.5 w-3.5" />;
    return <Package className="h-3.5 w-3.5" />;
  };

  // Classify each fulfillment with its original 1-based shipment number
  const indexedFulfillments = fulfillments
    .map((f, idx) => {
      const method = f.fulfillmentMethod || "unknown";
      const isPhysical = ["carrier", "vendor_truck"].includes(method);
      const isAwaitingDispatch = isPhysical && f.dispatchStatus !== "dispatched";

      const isResolvedDispute = f.resolutionStatus === "resolved_after_dispute";
      const confirmedUnits = f.lineItems.reduce((sum, li) => {
        const lineResolved =
          li.resolutionStatus === "resolved_after_dispute" || isResolvedDispute;
        const accepted =
          li.finalQuantityAccepted ??
          (lineResolved && (li.quantityAccepted === 0 || li.quantityAccepted == null)
            ? li.quantityReady || li.quantityShipped || 0
            : li.quantityAccepted ?? li.quantityReceived ?? 0);
        return sum + accepted;
      }, 0);

      const shippedUnits = f.lineItems.reduce(
        (sum, li) => sum + (li.quantityReady ?? li.quantityShipped ?? 0),
        0
      );

      const isConfirmed =
        f.status !== "cancelled" &&
        !isAwaitingDispatch &&
        (confirmedUnits > 0 ||
          f.confirmationOutcome === "confirmed" ||
          f.confirmationOutcome === "confirmed_with_exceptions" ||
          f.inspectionOutcome === "accepted" ||
          f.inspectionOutcome === "accepted_with_exceptions" ||
          isResolvedDispute);

      return {
        fulfillment: f,
        shipmentNumber: idx + 1,
        method,
        isPhysical,
        isAwaitingDispatch,
        confirmedUnits,
        shippedUnits,
        isConfirmed,
      };
    })
    .filter((entry) => entry.fulfillment.status !== "cancelled");

  const confirmedShipments = indexedFulfillments.filter((e) => e.isConfirmed);
  const unconfirmedShipments = indexedFulfillments.filter((e) => !e.isConfirmed);
  const awaitingDispatchList = unconfirmedShipments.filter((e) => e.isAwaitingDispatch);
  const awaitingReceiptList = unconfirmedShipments.filter((e) => !e.isAwaitingDispatch);

  const totalConfirmedAcrossShipments = lineItems.reduce((sum, item) => {
    const fulfillmentConfirmed = fulfillments.reduce((s, f) => {
      const match = f.lineItems.find(
        (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
      );
      return s + (match?.finalQuantityAccepted ?? match?.quantityAccepted ?? 0);
    }, 0);
    return sum + Math.max(item.quantityAccepted ?? item.quantityReceived ?? 0, fulfillmentConfirmed);
  }, 0);

  return (
    <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
      {/* Collapsible Summary Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground">
                Buyer-Confirmed Delivery Breakdown
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                {confirmedShipments.length} confirmed shipment{confirmedShipments.length === 1 ? "" : "s"} · {totalConfirmedAcrossShipments} units
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only deliveries inspected and confirmed by the buyer are included in this invoice.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
          <span>{expanded ? "Hide details" : "View details"}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Footnote for any shipments awaiting dispatch or awaiting buyer confirmation (hidden from main invoice list) */}
      {unconfirmedShipments.length > 0 && (
        <div className="px-6 py-3 bg-amber-50/70 border-t border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-amber-900">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              {awaitingDispatchList.length > 0 && (
                <>
                  <strong>
                    Shipment {awaitingDispatchList.map((s) => `#${s.shipmentNumber}`).join(", ")} (
                    {awaitingDispatchList.reduce((s, x) => s + x.shippedUnits, 0)} units)
                  </strong>{" "}
                  has not been dispatched yet and is excluded from this invoice.{" "}
                </>
              )}
              {awaitingReceiptList.length > 0 && (
                <>
                  <strong>
                    Shipment {awaitingReceiptList.map((s) => `#${s.shipmentNumber}`).join(", ")} (
                    {awaitingReceiptList.reduce((s, x) => s + x.shippedUnits, 0)} units)
                  </strong>{" "}
                  is awaiting buyer receipt confirmation and will become invoiceable once confirmed.
                </>
              )}
            </span>
          </div>
          {awaitingDispatchList.length > 0 && (
            <Link
              href={`/orders/${purchaseOrderId}`}
              className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 shrink-0"
            >
              Go to order to dispatch &rarr;
            </Link>
          )}
        </div>
      )}

      {expanded && (
        <>
          {/* Per-confirmed-fulfillment breakdown */}
          {confirmedShipments.length > 0 && (
            <div className="divide-y divide-border/60 border-t border-border">
              {confirmedShipments.map(({ fulfillment, shipmentNumber, method }) => (
                <div key={fulfillment.vendorDeliveryNoticeId} className="px-6 py-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground">
                      <MethodIcon method={method} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        Shipment #{shipmentNumber}
                        <span className="text-muted-foreground font-normal ml-1.5">
                          · {methodLabel[method] || method} ·{" "}
                          {fulfillment.declaration === "partial" ? "Partial" : "Full"}
                        </span>
                        {fulfillment.receiptNumber && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2">
                            {fulfillment.receiptNumber}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fulfillment.readyAt ? formatDateTime(fulfillment.readyAt) : "—"}
                      </p>
                    </div>
                    {fulfillment.resolutionStatus === "resolved_after_dispute" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                        Received (Dispute Resolved)
                      </span>
                    ) : fulfillment.confirmationOutcome === "confirmed_with_exceptions" ||
                      fulfillment.inspectionOutcome === "accepted_with_exceptions" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border bg-teal-50 text-teal-800 border-teal-200">
                        Partially Received
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border bg-green-50 text-green-700 border-green-200">
                        Received
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                          <th className="py-2 text-left text-xs font-medium text-muted-foreground">Shipped</th>
                          <th className="py-2 text-left text-xs font-medium text-muted-foreground">Buyer Confirmed</th>
                          <th className="py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fulfillment.lineItems.map((li: FulfillmentLineItem) => {
                          const isLineResolvedDispute =
                            li.resolutionStatus === "resolved_after_dispute" ||
                            fulfillment.resolutionStatus === "resolved_after_dispute";
                          const received =
                            li.finalQuantityAccepted ??
                            (isLineResolvedDispute &&
                            (li.quantityAccepted === 0 || li.quantityAccepted == null)
                              ? li.quantityReady || 0
                              : li.quantityAccepted ?? li.quantityReceived ?? 0);
                          const ready = li.quantityReady || li.quantityShipped || 0;

                          return (
                            <tr key={li.vendorDeliveryNoticeLineItemId} className="border-b border-border/20">
                              <td className="py-2 font-medium">{li.name}</td>
                              <td className="py-2">{ready}</td>
                              <td className="py-2">
                                <span
                                  className={cn(
                                    "font-medium",
                                    received > 0 ? "text-green-700" : "text-muted-foreground"
                                  )}
                                >
                                  {received}
                                </span>
                              </td>
                              <td className="py-2">
                                {received >= ready && ready > 0 ? (
                                  <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">
                                    Confirmed
                                  </span>
                                ) : received > 0 ? (
                                  <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md font-medium">
                                    Partially Confirmed ({received}/{ready})
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Aggregate invoiceable summary per line item */}
          <div className="border-t border-border bg-muted/20 px-6 py-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              Invoiceable Quantity Reconciliation
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground">Buyer Confirmed</th>
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground">Already Invoiced</th>
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground">Available to Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => {
                    const fulfillmentConfirmed = fulfillments.reduce((sum, f) => {
                      const match = f.lineItems.find(
                        (li) => li.purchaseOrderLineItemId === item.purchaseOrderLineItemId
                      );
                      return sum + (match?.finalQuantityAccepted ?? match?.quantityAccepted ?? 0);
                    }, 0);
                    const confirmed = Math.max(
                      item.quantityAccepted ?? item.quantityReceived ?? 0,
                      fulfillmentConfirmed
                    );
                    const invoiced = alreadyInvoicedByLine[item.purchaseOrderLineItemId] || 0;
                    const available = Math.max(0, confirmed - invoiced);

                    if (confirmed === 0 && invoiced === 0) return null;

                    return (
                      <tr key={item.purchaseOrderLineItemId} className="border-b border-border/20">
                        <td className="py-2 font-medium">{item.name}</td>
                        <td className="py-2">
                          <span className="text-green-700 font-medium">{confirmed}</span>
                        </td>
                        <td className="py-2">
                          <span className="text-muted-foreground">{invoiced}</span>
                        </td>
                        <td className="py-2">
                          <span
                            className={cn(
                              "font-semibold",
                              available > 0 ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {available}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Form ────────────────────────────────────────────────────────

interface InvoiceFormProps {
  mode: "create" | "edit";
  invoiceId?: string;
}

export function InvoiceForm({ mode, invoiceId }: InvoiceFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = mode === "edit" && !!invoiceId;
  const prefillPurchaseOrderId = searchParams.get("purchaseOrderId");

  const companyId = useCompanyStore((s) => s.activeCompanyId) ?? "";

  const [selectedPOId, setSelectedPOId] = useState(prefillPurchaseOrderId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISODate());
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormLineItem[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [prefilledPOId, setPrefilledPOId] = useState("");

  // ── Payment Terms for active company ──
  const { data: paymentTermsData } = useVendorPaymentTerms(
    companyId ? { companyId } : {},
    undefined,
    { enabled: !!companyId }
  );

  // ── Queries ──

  const { data: orders = [], isError: ordersError } = useQuery({
    queryKey: queryKeys.orders(companyId, { limit: 100 }),
    queryFn: () => getOrders({ limit: 100 }),
    enabled: !!companyId,
  });

  const { data: selectedOrderDetails } = useQuery({
    queryKey: queryKeys.order(companyId, selectedPOId),
    queryFn: () => getOrder(selectedPOId),
    enabled: !!selectedPOId && !!companyId,
  });

  const { data: receiptExceptions } = useOrderFulfillmentExceptions(selectedPOId);

  const rawFulfillments = useMemo(
    () => selectedOrderDetails?.fulfillments || selectedOrderDetails?.deliveryNotices || [],
    [selectedOrderDetails]
  );

  const combinedReceipts = useMemo(
    () => [
      ...(selectedOrderDetails?.receiptConfirmations || []),
      ...(selectedOrderDetails?.receipts || []),
      ...(selectedOrderDetails?.deliveryReceipts || []),
      ...(receiptExceptions || []),
    ],
    [selectedOrderDetails, receiptExceptions]
  );

  const fulfillments = useMemo(
    () => enrichFulfillmentsWithReceipts(rawFulfillments, combinedReceipts),
    [rawFulfillments, combinedReceipts]
  );

  const paymentTerms = paymentTermsData?.data || [];
  const companyPaymentTerm = useMemo(() => {
    if (selectedOrderDetails?.paymentTerms) {
      return selectedOrderDetails.paymentTerms;
    }
    if (!companyId || paymentTerms.length === 0) return null;
    return (
      paymentTerms.find((t) => t.companyId === companyId && t.isCurrent) ||
      paymentTerms.find((t) => t.companyId === companyId) ||
      paymentTerms[0]
    );
  }, [selectedOrderDetails?.paymentTerms, paymentTerms, companyId]);

  const isVendorSelectsDueDate = useMemo(() => {
    if (!companyPaymentTerm) return false;
    const code = (companyPaymentTerm.code || "").toUpperCase();
    const name = (companyPaymentTerm.name || "").toLowerCase();
    return (
      code === "VENDOR_SELECTS_DUE_DATE" ||
      name.includes("selects invoice due date") ||
      name.includes("specify terms per invoice") ||
      name.includes("dynamic")
    );
  }, [companyPaymentTerm]);

  // For all other payment terms, automatically prefill due date and keep it in sync:
  // - Payment upon delivery / Due on receipt (0 days): matches deliveryDate if available, else invoiceDate
  // - Net X days: invoiceDate + term.days
  useEffect(() => {
    if (mode !== "create") return;
    if (isVendorSelectsDueDate) return;

    if (companyPaymentTerm) {
      const isDeliveryOrReceipt =
        companyPaymentTerm.code === "DUE_ON_RECEIPT" ||
        (companyPaymentTerm.name || "").toLowerCase().includes("delivery") ||
        (companyPaymentTerm.name || "").toLowerCase().includes("receipt") ||
        companyPaymentTerm.days === 0;

      if (isDeliveryOrReceipt) {
        // Payment on delivery / Due on receipt
        const targetDate = deliveryDate || invoiceDate;
        if (targetDate) {
          setDueDate(targetDate);
        }
      } else if (companyPaymentTerm.days && companyPaymentTerm.days > 0 && invoiceDate) {
        // Net days
        try {
          const invDate = parseLocalDate(invoiceDate) || new Date(invoiceDate);
          const calculated = format(addDays(invDate, companyPaymentTerm.days), "yyyy-MM-dd");
          setDueDate(calculated);
        } catch {
          // ignore invalid date
        }
      }
    }
  }, [invoiceDate, deliveryDate, companyPaymentTerm, isVendorSelectsDueDate, mode]);

  // Fetch existing invoices for this PO so we can subtract already-invoiced quantities
  const { data: existingPOInvoices = [] } = useQuery({
    queryKey: queryKeys.invoices(companyId, { purchaseOrderId: selectedPOId }),
    queryFn: () => getInvoices({ purchaseOrderId: selectedPOId }),
    enabled: !!selectedPOId && !!companyId && mode === "create",
  });

  const {
    data: existingInvoice,
    isLoading: isLoadingExisting,
    isError: existingInvoiceError,
  } = useQuery({
    queryKey: queryKeys.invoice(companyId, invoiceId ?? ""),
    queryFn: () => getInvoice(invoiceId!),
    enabled: isEditing && !!companyId,
  });

  // ── Compute already-invoiced quantities per PO line ──
  // Only count non-rejected invoices. In edit mode, also exclude the current invoice
  // so its own quantities aren't double-counted.
  const alreadyInvoicedByLine = useMemo(() => {
    const map: Record<string, number> = {};
    const relevantInvoices = existingPOInvoices.filter(
      (inv) => inv.status !== "rejected" && (!isEditing || inv.vendorInvoiceId !== invoiceId)
    );
    for (const inv of relevantInvoices) {
      for (const li of inv.lineItems) {
        if (li.purchaseOrderLineItemId) {
          map[li.purchaseOrderLineItemId] = (map[li.purchaseOrderLineItemId] || 0) + li.quantity;
        }
      }
    }
    return map;
  }, [existingPOInvoices, isEditing, invoiceId]);

  // ── Pre-fill logic (create mode) ──
  // Uses buyer-confirmed quantities (quantityReceived) minus already-invoiced.
  // Falls back to quantityInvoiceable if the backend provides it.
  useEffect(() => {
    if (mode === "create" && selectedPOId && selectedOrderDetails && prefilledPOId !== selectedPOId) {
      const po = selectedOrderDetails;
      setCurrency(po.currency || "USD");

      // Auto-populate delivery date from the purchase order and its fulfillment history
      const autoDate = extractDeliveryDateFromOrder(po, fulfillments);
      if (autoDate) {
        setDeliveryDate(autoDate);
      }

      if (po.lineItems && po.lineItems.length > 0) {
        const invoiceableLines: FormLineItem[] = [];

        for (const line of po.lineItems) {
          const fulfillmentConfirmed = fulfillments.reduce((sum, f) => {
            const match = f.lineItems.find((li) => li.purchaseOrderLineItemId === line.purchaseOrderLineItemId);
            return sum + (match?.finalQuantityAccepted ?? match?.quantityAccepted ?? 0);
          }, 0);
          const confirmed = Math.max(line.quantityAccepted ?? line.quantityReceived ?? 0, fulfillmentConfirmed);
          const alreadyInvoiced = alreadyInvoicedByLine[line.purchaseOrderLineItemId] || 0;

          // Use backend-provided quantityInvoiceable if available, otherwise compute
          const maxInvoiceable = line.quantityInvoiceable != null
            ? Math.max(0, line.quantityInvoiceable - alreadyInvoiced)
            : Math.max(0, confirmed - alreadyInvoiced);

          if (maxInvoiceable > 0) {
            // Scale tax proportionally to the invoiceable quantity
            const scaledTax = line.quantity > 0 ? (line.taxAmount / line.quantity) * maxInvoiceable : 0;
            const roundedTax = Math.round(scaledTax * 100) / 100;

            invoiceableLines.push({
              _key: generateKey(),
              purchaseOrderLineItemId: line.purchaseOrderLineItemId,
              name: line.name,
              description: line.description || "",
              quantity: maxInvoiceable,
              unitPrice: line.unitPrice,
              taxAmount: roundedTax,
              sku: line.sku || "",
              unitOfMeasure: line.unitOfMeasure || "",
              _maxInvoiceable: maxInvoiceable,
            });
          }
        }

        if (invoiceableLines.length > 0) {
          setItems(invoiceableLines);
        } else {
          setItems([]);
          const totalConfirmed = po.lineItems.reduce(
            (s, l) => s + (l.quantityAccepted ?? l.quantityReceived ?? 0),
            0
          );
          if (totalConfirmed === 0) {
            toast.error("No deliveries have been confirmed by the buyer yet. You can only invoice for confirmed quantities.");
          } else {
            toast.info("All confirmed deliveries have already been invoiced.");
          }
        }
      }
      setPrefilledPOId(selectedPOId);
    }
  }, [selectedPOId, mode, selectedOrderDetails, prefilledPOId, alreadyInvoicedByLine, fulfillments]);

  // ── Edit mode: load existing invoice data ──
  useEffect(() => {
    if (isEditing && existingInvoiceError) {
      toast.error("Couldn't load the invoice you're trying to edit.");
    }
  }, [isEditing, existingInvoiceError]);

  useEffect(() => {
    if (!existingInvoice) return;
    setSelectedPOId(existingInvoice.purchaseOrderId);
    setInvoiceNumber(existingInvoice.invoiceNumber);
    setInvoiceDate(existingInvoice.invoiceDate);
    setDueDate(existingInvoice.dueDate ?? "");
    setDeliveryDate(existingInvoice.deliveryDate ?? "");
    setCurrency(existingInvoice.currency);
    setNotes(existingInvoice.notes ?? "");
    setItems(
      existingInvoice.lineItems.map((i) => ({
        _key: i.vendorInvoiceLineItemId,
        purchaseOrderLineItemId: i.purchaseOrderLineItemId ?? "",
        name: i.name,
        description: i.description ?? "",
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxAmount: i.taxAmount,
        sku: i.sku ?? "",
        unitOfMeasure: i.unitOfMeasure ?? "",
        _maxInvoiceable: i.quantity, // In edit mode, current quantity is the baseline
      }))
    );
  }, [existingInvoice]);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const taxTotal = items.reduce((sum, i) => sum + (i.taxAmount ?? 0), 0);
  const total = subtotal + taxTotal;
  const totalBilledUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  const invoiceNumberInputRef = useRef<HTMLInputElement>(null);
  const [invoiceNumberTouched, setInvoiceNumberTouched] = useState(false);
  const [isChangingPO, setIsChangingPO] = useState(!prefillPurchaseOrderId);

  const handleGenerateInvoiceNumber = () => {
    const poSuffix = selectedOrderDetails?.poNumber
      ? selectedOrderDetails.poNumber.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase()
      : Math.floor(1000 + Math.random() * 9000).toString();
    const seq = (existingPOInvoices.length || 0) + 1;
    const generated = `INV-${new Date().getFullYear()}-${poSuffix}-${String(seq).padStart(2, "0")}`;
    setInvoiceNumber(generated);
    setInvoiceNumberTouched(false);
  };

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isPending = createInvoice.isPending || updateInvoice.isPending;

  const validate = (): string | null => {
    if (!selectedPOId) return "Please select a purchase order to invoice against.";
    if (!invoiceNumber.trim()) return "Please enter your Supplier Invoice Number (or click 'Generate #' to create one).";
    if (!invoiceDate) return "Please select an invoice date.";
    if (isVendorSelectsDueDate) {
      if (!dueDate) {
        return "Please select a due date for this invoice as your agreed payment terms require specifying the due date per invoice.";
      }
      if (isBefore(startOfDay(new Date(dueDate)), startOfDay(new Date()))) {
        return "Due date must be today or in the future.";
      }
      if (invoiceDate && isBefore(startOfDay(new Date(dueDate)), startOfDay(new Date(invoiceDate)))) {
        return "Due date cannot be earlier than the invoice date.";
      }
    }
    if (items.length === 0) return "No invoiceable items. The buyer must confirm receipt of deliveries before you can invoice.";
    const invalidItem = items.find((i) => !i.purchaseOrderLineItemId || !i.name.trim() || i.quantity <= 0 || i.unitPrice <= 0);
    if (invalidItem) {
      return "Every line item needs a name, a quantity greater than 0, and a unit price greater than 0.";
    }
    // Check no item exceeds its max invoiceable
    const overItem = items.find((i) => i._maxInvoiceable > 0 && i.quantity > i._maxInvoiceable);
    if (overItem) {
      return `"${overItem.name}" quantity (${overItem.quantity}) exceeds the maximum invoiceable (${overItem._maxInvoiceable}).`;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) {
      setInvoiceNumberTouched(true);
      invoiceNumberInputRef.current?.focus();
      invoiceNumberInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const lineItems: InvoiceLineItemInput[] = items.map((i) => ({
      purchaseOrderLineItemId: i.purchaseOrderLineItemId,
      name: i.name.trim(),
      description: i.description?.trim() || undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxAmount: i.taxAmount || undefined,
      sku: i.sku?.trim() || undefined,
      unitOfMeasure: i.unitOfMeasure?.trim() || undefined,
    }));

    const payload: CreateInvoicePayload = {
      purchaseOrderId: selectedPOId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      ...(isVendorSelectsDueDate && dueDate ? { dueDate } : {}),
      deliveryDate: deliveryDate || undefined,
      currency,
      notes: notes.trim() || undefined,
      lineItems,
    };

    try {
      if (isEditing) {
        await updateInvoice.mutateAsync({ id: invoiceId!, payload });
      } else {
        await createInvoice.mutateAsync(payload);
      }
      setShowSuccess(true);
    } catch {
      // Mutation hooks already surface a toast via onError.
    }
  };

  const updateItem = (key: string, field: keyof FormLineItem, value: string | number) =>
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, [field]: value } : i)));

  const handleSuccessClose = () => {
    setShowSuccess(false);
    router.push("/invoices");
  };

  if (isEditing && isLoadingExisting) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const hasInvoiceableItems = items.length > 0;
  const missingInvoiceNumber = !invoiceNumber.trim();

  return (
    <>
      <div className="space-y-5">
        <div className="sticky top-0 z-20 bg-dashboard-bg/95 backdrop-blur-sm -mx-4 px-4 sm:-mx-6 sm:px-6 -mt-4 pt-4 sm:-mt-6 sm:pt-6 pb-4 border-b border-border mb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
              <div>
                <h1 className="text-xl font-bold">{isEditing ? "Edit Invoice" : "Create New Invoice"}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Submit an invoice against buyer-confirmed deliveries</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-4">
            {/* ── Step 1: Invoice Details ── */}
            <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">1. Invoice Details</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enter your invoice reference number and verify your billing dates.
                  </p>
                </div>
                {companyPaymentTerm && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                    <span>Terms: {companyPaymentTerm.name}</span>
                    {isVendorSelectsDueDate ? (
                      <span className="text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 text-[10px]">
                        Due Date Required
                      </span>
                    ) : companyPaymentTerm.days > 0 ? (
                      <span className="text-muted-foreground text-[11px]">({companyPaymentTerm.days} days)</span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">(Due on receipt)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Clean Purchase Order Summary Strip (when PO is selected) */}
              {selectedPOId && selectedOrderDetails && !isChangingPO ? (
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Purchase Order: </span>
                      <span className="font-bold text-foreground">{selectedOrderDetails.poNumber}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Currency: </span>
                      <span className="font-semibold text-foreground">{currency}</span>
                    </div>
                    {deliveryDate && (
                      <div>
                        <span className="text-muted-foreground">Confirmed Delivery Date: </span>
                        <span className="font-semibold text-foreground">{formatDate(deliveryDate)}</span>
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => setIsChangingPO(true)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Change PO
                    </button>
                  )}
                </div>
              ) : (
                <FormField label="Purchase Order">
                  <Select
                    value={selectedPOId}
                    onValueChange={(val) => {
                      setSelectedPOId(val);
                      setPrefilledPOId("");
                      setIsChangingPO(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a purchase order" />
                    </SelectTrigger>
                    <SelectContent>
                      {orders.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {ordersError ? "Couldn't load orders." : "No orders available."}
                        </div>
                      ) : (
                        orders.map((o) => (
                          <SelectItem key={o.purchaseOrderId} value={o.purchaseOrderId}>
                            {o.poNumber}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">
                      Supplier Invoice Number <span className="text-red-500">*</span>
                    </label>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={handleGenerateInvoiceNumber}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        <Sparkles className="h-3 w-3" />
                        Auto-generate
                      </button>
                    )}
                  </div>
                  <Input
                    ref={invoiceNumberInputRef}
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => {
                      setInvoiceNumber(e.target.value);
                      if (e.target.value.trim()) setInvoiceNumberTouched(false);
                    }}
                    placeholder="e.g., INV-2026-001"
                    className={cn(
                      invoiceNumberTouched && missingInvoiceNumber
                        ? "border-red-500 ring-2 ring-red-500/15"
                        : ""
                    )}
                  />
                  {invoiceNumberTouched && missingInvoiceNumber ? (
                    <p className="text-[11px] text-red-600 font-medium">
                      Please enter your invoice number or click &ldquo;Auto-generate&rdquo;.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Your internal bill/invoice reference number.
                    </p>
                  )}
                </div>

                <FormField label="Invoice Date">
                  <div>
                    <DatePicker
                      date={parseLocalDate(invoiceDate)}
                      onSelect={(d) => setInvoiceDate(d ? format(d, "yyyy-MM-dd") : "")}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Defaults to today&apos;s date.
                    </p>
                  </div>
                </FormField>

                <FormField
                  label={
                    isVendorSelectsDueDate
                      ? "Payment Due Date *"
                      : "Payment Due Date"
                  }
                >
                  <div>
                    <DatePicker
                      date={parseLocalDate(dueDate)}
                      onSelect={(d) => {
                        if (!isVendorSelectsDueDate) return;
                        setDueDate(d ? format(d, "yyyy-MM-dd") : "");
                      }}
                      disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                      isDisabled={!isVendorSelectsDueDate}
                      error={
                        isVendorSelectsDueDate &&
                        (!dueDate ||
                          isBefore(
                            startOfDay(parseLocalDate(dueDate) || new Date()),
                            startOfDay(new Date())
                          ))
                      }
                    />
                    {isVendorSelectsDueDate ? (
                      <p className="text-[11px] text-teal-700 mt-1">
                        Select when payment is due.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Calculated automatically from {companyPaymentTerm?.name || "agreed terms"}.
                      </p>
                    )}
                  </div>
                </FormField>
              </div>

              <div>
                <FormField label="Notes for Buyer (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional payment instructions or remarks for the buyer’s finance team…"
                    rows={2}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </FormField>
              </div>
            </div>

            {/* ── Step 2: Invoice Items Table (Placed Directly Above Fold) ── */}
            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold">
                    2. Items You Are Billing For{" "}
                    <span className="text-muted-foreground font-normal ml-1">({items.length})</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quantities are pre-filled with buyer-confirmed units not yet invoiced. You can adjust quantities down if billing partially.
                  </p>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {selectedPOId
                    ? "No buyer-confirmed items are available to invoice for this purchase order yet."
                    : "Select a purchase order above to populate invoice items."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">
                          Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Quantity to Invoice
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Tax
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Line Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {items.map((item) => {
                        const lineTotal =
                          item.quantity * item.unitPrice + (item.taxAmount ?? 0);
                        return (
                          <tr key={item._key} className="hover:bg-muted/10 transition-colors">
                            <td className="px-6 py-3.5">
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                                  {item.description}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <label htmlFor={`item-qty-${item._key}`} className="sr-only">
                                  Invoice quantity for {item.name}
                                </label>
                                <input
                                  id={`item-qty-${item._key}`}
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const clamped = Math.min(
                                      Math.max(0, val),
                                      item._maxInvoiceable || val
                                    );
                                    updateItem(item._key, "quantity", clamped);
                                    // Recalculate tax proportionally
                                    if (item._maxInvoiceable > 0) {
                                      const baseTaxPerUnit =
                                        (item.taxAmount ?? 0) / (item.quantity || 1);
                                      updateItem(
                                        item._key,
                                        "taxAmount",
                                        Math.round(baseTaxPerUnit * clamped * 100) / 100
                                      );
                                    }
                                  }}
                                  min={1}
                                  max={item._maxInvoiceable || undefined}
                                  className="w-20 h-9 text-sm font-semibold border border-border rounded-lg px-2 text-center bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                {item._maxInvoiceable > 0 && (
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    of {item._maxInvoiceable} confirmed
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.unitPrice, currency)}
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.taxAmount ?? 0, currency)}
                            </td>
                            <td className="px-6 py-3.5 text-right text-sm font-bold text-foreground whitespace-nowrap">
                              {formatCurrency(lineTotal, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Collapsible Buyer-Confirmed Delivery Breakdown (create mode only) ── */}
            {mode === "create" && selectedOrderDetails && (
              <DeliveryReceiptOverview
                purchaseOrderId={selectedOrderDetails.purchaseOrderId}
                lineItems={selectedOrderDetails.lineItems}
                fulfillments={fulfillments}
                alreadyInvoicedByLine={alreadyInvoicedByLine}
              />
            )}
          </div>

          {/* ── Invoice Summary Sidebar ── */}
          <div className="bg-navy rounded-2xl p-5 text-navy-foreground lg:sticky lg:top-20 h-fit">
            <h3 className="text-base font-semibold mb-4">Invoice Summary</h3>
            <div className="space-y-2.5 mb-5">
              <div className="flex items-center justify-between text-xs text-white/60 pb-2 border-b border-white/10">
                <span>Total Confirmed Units Billed</span>
                <span className="font-semibold text-white">{totalBilledUnits} units</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Tax</span>
                <span className="font-medium">{formatCurrency(taxTotal, currency)}</span>
              </div>
              <div className="h-px bg-white/20 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">Total Amount</span>
                <span className="text-lg font-bold">{formatCurrency(total, currency)}</span>
              </div>
            </div>

            {missingInvoiceNumber && hasInvoiceableItems && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-[11px] text-amber-200 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>Enter your Supplier Invoice Number in Step 1 to submit.</span>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full bg-primary hover:bg-primary/90"
              loading={isPending}
              disabled={!hasInvoiceableItems}
              onClick={handleSubmit}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {isEditing ? "Update Invoice" : "Submit Invoice"}
            </Button>
            <p className="text-xs text-white/50 text-center mt-2.5">Secure Submission via Villeto</p>
          </div>
        </div>
      </div>

      {/* ── Success Dialog ── */}
      <Dialog open={showSuccess} onOpenChange={(o) => !o && handleSuccessClose()}>
        <DialogContent size="sm" showClose>
          <div className="flex flex-col items-center text-center py-4">
            <div className="relative mb-5" aria-hidden="true">
              {(
                [
                  { top: "10%", left: "5%", color: "bg-blue-500", size: "h-2 w-2" },
                  { top: "5%", right: "15%", color: "bg-orange-400", size: "h-1.5 w-1.5" },
                  { top: "25%", right: "0%", color: "bg-green-500", size: "h-2.5 w-2.5" },
                  { bottom: "15%", right: "5%", color: "bg-blue-400", size: "h-1.5 w-1.5" },
                  { bottom: "5%", left: "20%", color: "bg-primary", size: "h-2 w-2" },
                  { top: "40%", left: "0%", color: "bg-orange-500", size: "h-1.5 w-1.5" },
                ] as const
              ).map((dot, i) => (
                <div
                  key={i}
                  className={cn("absolute rounded-full", dot.color, dot.size)}
                  style={{
                    top: "top" in dot ? dot.top : undefined,
                    left: "left" in dot ? dot.left : undefined,
                    right: "right" in dot ? dot.right : undefined,
                    bottom: "bottom" in dot ? dot.bottom : undefined,
                  }}
                />
              ))}
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-white" aria-hidden="true" />
              </div>
            </div>

            <h2 className="text-xl font-bold mb-2">{isEditing ? "Updated Successfully" : "Submitted Successfully"}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your invoice has been sent for review and approval, you&apos;ll be notified of the progress.
            </p>

            <Button variant="primary" size="lg" className="w-full" onClick={handleSuccessClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
