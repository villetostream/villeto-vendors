"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getOrders } from "@/lib/api/orders";
import { getInvoice } from "@/lib/api/invoices";
import { queryKeys, useCompanyStore } from "@/lib/stores/companyStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/Label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { Dialog, DialogContent } from "@/components/ui/Modal";
import { useCreateInvoice, useUpdateInvoice } from "@/lib/hooks/useInvoices";
import { formatCurrency, cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { DatePicker } from "@/components/ui/DatePicker";
import { InvoiceLineItemInput } from "@/lib/types";
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
}

function generateKey() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyLineItem(): FormLineItem {
  return { _key: generateKey(), name: "", description: "", quantity: 1, unitPrice: 0, taxAmount: 0, sku: "", unitOfMeasure: "" };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [items, setItems] = useState<FormLineItem[]>([emptyLineItem()]);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: orders = [], isError: ordersError } = useQuery({
    queryKey: queryKeys.orders(companyId, { limit: 100 }),
    queryFn: () => getOrders({ limit: 100 }),
    enabled: !!companyId,
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
        name: i.name,
        description: i.description ?? "",
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxAmount: i.taxAmount,
        sku: i.sku ?? "",
        unitOfMeasure: i.unitOfMeasure ?? "",
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
    if (items.length === 0) return "Add at least one line item.";
    const invalidItem = items.find((i) => !i.name.trim() || i.quantity <= 0 || i.unitPrice <= 0);
    if (invalidItem) {
      return "Every line item needs a name, a quantity greater than 0, and a unit price greater than 0.";
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

  const addItem = () => setItems((prev) => [...prev, emptyLineItem()]);
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i._key !== key));
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

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="Go back" className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{isEditing ? "Edit Invoice" : "Create New Invoice"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Submit an invoice against a purchase order</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
          <div className="space-y-4">
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

                <FormField label="Invoice Number">
                  <Input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-001"
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
                  <Input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
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

            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">
                  Invoice Items <span className="text-muted-foreground font-normal ml-1">{items.length}</span>
                </h2>
                <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Item
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Description", "Qty", "Unit Price", "Tax", "Total", ""].map((col, i) => (
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
                            onChange={(e) => updateItem(item._key, "name", e.target.value)}
                            placeholder="Item name"
                            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-28"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <label htmlFor={`item-desc-${item._key}`} className="sr-only">Description</label>
                          <input
                            id={`item-desc-${item._key}`}
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item._key, "description", e.target.value)}
                            placeholder="Optional"
                            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-28"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <label htmlFor={`item-qty-${item._key}`} className="sr-only">Quantity</label>
                          <input
                            id={`item-qty-${item._key}`}
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item._key, "quantity", parseInt(e.target.value) || 0)}
                            className="w-16 text-sm border border-border rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            min={0}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <label htmlFor={`item-price-${item._key}`} className="sr-only">Unit price</label>
                          <input
                            id={`item-price-${item._key}`}
                            type="number"
                            value={item.unitPrice || ""}
                            onChange={(e) => updateItem(item._key, "unitPrice", parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-24 text-sm border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            min={0}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <label htmlFor={`item-tax-${item._key}`} className="sr-only">Tax amount</label>
                          <input
                            id={`item-tax-${item._key}`}
                            type="number"
                            value={item.taxAmount || ""}
                            onChange={(e) => updateItem(item._key, "taxAmount", parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-20 text-sm border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            min={0}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium whitespace-nowrap">
                          {formatCurrency(item.quantity * item.unitPrice + (item.taxAmount ?? 0), currency)}
                        </td>
                        <td className="px-4 py-2.5">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(item._key)}
                              aria-label={`Remove ${item.name || "this item"}`}
                              className="p-1 text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-border">
                <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Item
                </button>
              </div>
            </div>
          </div>

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

            <Button variant="primary" size="lg" className="w-full bg-primary hover:bg-primary/90" loading={isPending} onClick={handleSubmit}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {isEditing ? "Update Invoice" : "Submit Invoice"}
            </Button>
            <p className="text-xs text-white/50 text-center mt-2.5">Secure Submission via Villeto</p>
          </div>
        </div>
      </div>

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
