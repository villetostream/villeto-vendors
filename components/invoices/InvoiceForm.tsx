"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, CheckCircle2, Package, Truck, Monitor, Wrench, ClipboardCheck, Info } from "lucide-react";
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
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { DatePicker } from "@/components/ui/DatePicker";
import { InvoiceLineItemInput, OrderLineItem, Fulfillment, FulfillmentLineItem } from "@/lib/types";
import { format } from "date-fns";

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

// ── Delivery & Receipt Overview ──────────────────────────────────────
// Shows vendors per-fulfillment what was dispatched vs what the buyer confirmed,
// so they understand exactly what they're invoicing for.

function DeliveryReceiptOverview({
  lineItems,
  fulfillments,
  alreadyInvoicedByLine,
}: {
  lineItems: OrderLineItem[];
  fulfillments: Fulfillment[];
  alreadyInvoicedByLine: Record<string, number>;
}) {
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

  return (
    <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Delivery & Receipt Overview</h2>
      </div>

      {/* Per-fulfillment accordion */}
      <div className="divide-y divide-border/60">
        {fulfillments.map((fulfillment, idx) => {
          const method = fulfillment.fulfillmentMethod || "unknown";

          return (
            <div key={fulfillment.vendorDeliveryNoticeId} className="px-6 py-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground">
                  <MethodIcon method={method} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    Shipment #{idx + 1}
                    <span className="text-muted-foreground font-normal ml-1.5">
                      · {methodLabel[method] || method} · {fulfillment.declaration === "partial" ? "Partial" : "Full"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fulfillment.readyAt ? formatDateTime(fulfillment.readyAt) : "—"}
                  </p>
                </div>
                {["carrier", "vendor_truck"].includes(method) && (
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                    fulfillment.dispatchStatus === "dispatched"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  )}>
                    {fulfillment.dispatchStatus === "dispatched" ? "Dispatched" : "Awaiting Dispatch"}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                      <th className="py-2 text-left text-xs font-medium text-muted-foreground">Dispatched</th>
                      <th className="py-2 text-left text-xs font-medium text-muted-foreground">Buyer Confirmed</th>
                      <th className="py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fulfillment.lineItems.map((li: FulfillmentLineItem) => {
                      const received = li.quantityReceived || 0;
                      const ready = li.quantityReady || 0;

                      return (
                        <tr key={li.vendorDeliveryNoticeLineItemId} className="border-b border-border/20">
                          <td className="py-2 font-medium">{li.name}</td>
                          <td className="py-2">{ready}</td>
                          <td className="py-2">
                            <span className={cn("font-medium", received > 0 ? "text-green-700" : "text-muted-foreground")}>
                              {received}
                            </span>
                          </td>
                          <td className="py-2">
                            {received >= ready && ready > 0 ? (
                              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md font-medium">Confirmed</span>
                            ) : received > 0 ? (
                              <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md font-medium">Partial</span>
                            ) : ready > 0 ? (
                              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">Awaiting</span>
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
          );
        })}
      </div>

      {/* Aggregate invoiceable summary per line item */}
      <div className="border-t border-border bg-muted/20 px-6 py-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Invoiceable Summary</p>
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
                const confirmed = item.quantityReceived || 0;
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
                      {invoiced > 0 ? (
                        <span className="text-muted-foreground">{invoiced}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-2">
                      {available > 0 ? (
                        <span className="text-primary font-semibold">{available}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
  const [deliveryDate, setDeliveryDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormLineItem[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [prefilledPOId, setPrefilledPOId] = useState("");

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

      if (po.lineItems && po.lineItems.length > 0) {
        const invoiceableLines: FormLineItem[] = [];

        for (const line of po.lineItems) {
          const confirmed = line.quantityReceived || 0;
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
          const totalConfirmed = po.lineItems.reduce((s, l) => s + (l.quantityReceived || 0), 0);
          if (totalConfirmed === 0) {
            toast.error("No deliveries have been confirmed by the buyer yet. You can only invoice for confirmed quantities.");
          } else {
            toast.info("All confirmed deliveries have already been invoiced.");
          }
        }
      }
      setPrefilledPOId(selectedPOId);
    }
  }, [selectedPOId, mode, selectedOrderDetails, prefilledPOId, alreadyInvoicedByLine]);

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

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isPending = createInvoice.isPending || updateInvoice.isPending;

  const validate = (): string | null => {
    if (!selectedPOId) return "Please select a purchase order to invoice against.";
    if (!invoiceNumber.trim()) return "Please enter an invoice number.";
    if (!invoiceDate) return "Please select an invoice date.";
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

    const payload = {
      purchaseOrderId: selectedPOId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
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

  const fulfillments = selectedOrderDetails?.fulfillments || selectedOrderDetails?.deliveryNotices || [];
  const hasInvoiceableItems = items.length > 0;

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
          <div className="space-y-4">
            {/* ── Invoice Information ── */}
            <div className="bg-white rounded-2xl border border-dashboard-border p-6">
              <h2 className="text-base font-semibold mb-5">Invoice Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Purchase Order">
                  <Select value={selectedPOId} onValueChange={setSelectedPOId}>
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

                <FormField label="Supplier Invoice Number">
                  <Input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g., INV-2024-00123"
                    required
                  />
                </FormField>

                <FormField label="Invoice Date">
                  <DatePicker
                    date={invoiceDate ? new Date(invoiceDate) : undefined}
                    onSelect={(d) => setInvoiceDate(d ? format(d, "yyyy-MM-dd") : "")}
                  />
                </FormField>

                <FormField label="Delivery Date">
                  <DatePicker
                    date={deliveryDate ? new Date(deliveryDate) : undefined}
                    onSelect={(d) => setDeliveryDate(d ? format(d, "yyyy-MM-dd") : "")}
                  />
                </FormField>

                <FormField label="Currency">
                  <Input type="text" value={currency} disabled title="Currency is determined by the purchase order" />
                </FormField>
              </div>

              <div className="mt-4">
                <FormField label="Notes (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the buyer should know about this invoice…"
                    rows={2}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </FormField>
              </div>
            </div>

            {/* ── Delivery & Receipt Overview (create mode only) ── */}
            {mode === "create" && selectedOrderDetails && (
              <DeliveryReceiptOverview
                lineItems={selectedOrderDetails.lineItems}
                fulfillments={fulfillments}
                alreadyInvoicedByLine={alreadyInvoicedByLine}
              />
            )}

            {/* ── Invoiceable guidance ── */}
            {mode === "create" && selectedPOId && selectedOrderDetails && (
              <div className={cn(
                "flex items-start gap-2.5 text-xs font-medium rounded-lg px-3 py-2.5 border",
                hasInvoiceableItems
                  ? "bg-blue-50 text-blue-700 border-blue-100"
                  : "bg-amber-50 text-amber-700 border-amber-100"
              )}>
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {hasInvoiceableItems
                  ? "Invoice items are pre-filled with buyer-confirmed quantities minus any already-invoiced amounts. You can adjust quantities down if needed."
                  : "No items are available to invoice. The buyer must confirm receipt of your deliveries first, or all confirmed quantities have already been invoiced."
                }
              </div>
            )}

            {/* ── Invoice Items Table ── */}
            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">
                  Invoice Items <span className="text-muted-foreground font-normal ml-1">{items.length}</span>
                </h2>
              </div>

              {items.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {selectedPOId
                    ? "No invoiceable items found for this purchase order."
                    : "Select a purchase order above to populate invoice items."
                  }
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-border">
                        {["Name", "Description", "Invoice Qty", "Max", "Unit Price", "Tax", "Total"].map((col, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item._key} className="border-b border-border/60">
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-name-${item._key}`} className="sr-only">Item name</label>
                            <input
                              id={`item-name-${item._key}`}
                              type="text"
                              value={item.name}
                              disabled
                              className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-muted/50 cursor-not-allowed min-w-36"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-desc-${item._key}`} className="sr-only">Description</label>
                            <input
                              id={`item-desc-${item._key}`}
                              type="text"
                              value={item.description}
                              disabled
                              className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-muted/50 cursor-not-allowed min-w-28"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-qty-${item._key}`} className="sr-only">Invoice quantity</label>
                            <input
                              id={`item-qty-${item._key}`}
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                const clamped = Math.min(Math.max(0, val), item._maxInvoiceable || val);
                                updateItem(item._key, "quantity", clamped);
                                // Recalculate tax proportionally
                                if (item._maxInvoiceable > 0) {
                                  const baseTaxPerUnit = (item.taxAmount ?? 0) / (item.quantity || 1);
                                  updateItem(item._key, "taxAmount", Math.round(baseTaxPerUnit * clamped * 100) / 100);
                                }
                              }}
                              min={1}
                              max={item._maxInvoiceable || undefined}
                              className="w-20 text-sm border border-border rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs text-muted-foreground font-medium">
                              {item._maxInvoiceable > 0 ? item._maxInvoiceable : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-price-${item._key}`} className="sr-only">Unit price</label>
                            <input
                              id={`item-price-${item._key}`}
                              type="number"
                              value={item.unitPrice || ""}
                              disabled
                              className="w-24 text-sm border border-border rounded-lg px-2 py-1.5 bg-muted/50 cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-tax-${item._key}`} className="sr-only">Tax amount</label>
                            <input
                              id={`item-tax-${item._key}`}
                              type="number"
                              value={item.taxAmount || ""}
                              disabled
                              className="w-20 text-sm border border-border rounded-lg px-2 py-1.5 bg-muted/50 cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium whitespace-nowrap">
                            {formatCurrency(item.quantity * item.unitPrice + (item.taxAmount ?? 0), currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Invoice Summary Sidebar ── */}
          <div className="bg-navy rounded-2xl p-5 text-navy-foreground lg:sticky lg:top-20">
            <h3 className="text-base font-semibold mb-5">Invoice Summary</h3>
            <div className="space-y-3 mb-5">
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

            <Button
              variant="primary"
              size="lg"
              className="w-full bg-primary hover:bg-primary/90"
              loading={isPending}
              disabled={!hasInvoiceableItems || validate() !== null}
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
