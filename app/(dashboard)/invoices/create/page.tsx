"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrders } from "@/lib/api/orders";
import { getInvoice } from "@/lib/api/invoices";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/Label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/Select";
import {
  Dialog, DialogContent,
} from "@/components/ui/Modal";
import { useCreateInvoice, useUpdateInvoice } from "@/lib/hooks/useInvoices";
import { formatCurrency, cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { PageSpinner } from "@/components/ui/Spinner";

interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

const TAX_RATE = 0; // 0% — configurable per org in the future

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function CreateInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const prefillOrderId = searchParams.get("order_id");
  const isEditing = !!editId;

  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  const [selectedOrderId, setSelectedOrderId] = useState(prefillOrderId ?? "");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { id: generateId(), name: "", quantity: 0, unit_price: 0 },
  ]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch orders for the dropdown
  const { data: ordersData } = useQuery({
    queryKey: queryKeys.orders(orgId, { per_page: 100 }),
    queryFn: () => getOrders({ per_page: 100 }),
    enabled: !!orgId,
  });

  // If editing, load existing invoice
  const { data: existingInvoice } = useQuery({
    queryKey: queryKeys.invoice(orgId, editId ?? ""),
    queryFn: () => getInvoice(editId!),
    enabled: !!editId && !!orgId,
  });

  // Populate form when editing
  useEffect(() => {
    if (!existingInvoice) return;
    setDeliveryDate(existingInvoice.delivery_date ?? "");
    setItems(
      existingInvoice.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }))
    );
  }, [existingInvoice]);

  // Auto-populate items when a PO is selected
  const selectedOrder = ordersData?.data?.find((o) => o.id === selectedOrderId);
  useEffect(() => {
    if (!selectedOrder || isEditing) return;
    setItems(
      selectedOrder.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price ?? 0,
      }))
    );
  }, [selectedOrder, isEditing]);

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const handleSubmit = async () => {
    const payload = {
      order_id: selectedOrderId || undefined,
      delivery_date: deliveryDate,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    };

    if (isEditing) {
      await updateInvoice.mutateAsync({ id: editId!, payload });
    } else {
      await createInvoice.mutateAsync(payload);
    }
    setShowSuccess(true);
  };

  const isPending = createInvoice.isPending || updateInvoice.isPending;

  const addItem = () =>
    setItems((prev) => [...prev, { id: generateId(), name: "", quantity: 0, unit_price: 0 }]);

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, field: keyof LineItem, value: string | number) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );

  const handleSuccessClose = () => {
    setShowSuccess(false);
    router.push("/invoices");
  };

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold">
              {isEditing ? "Edit Invoice" : "Create New Invoice"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate an invoice with ease
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
          {/* Left — Invoice form */}
          <div className="space-y-4">
            {/* Invoice information */}
            <div className="bg-white rounded-2xl border border-dashboard-border p-6">
              <h2 className="text-base font-semibold mb-5">Invoice Information</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Order selector */}
                <FormField label="Order">
                  <Select
                    value={selectedOrderId}
                    onValueChange={setSelectedOrderId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Enter order" />
                    </SelectTrigger>
                    <SelectContent>
                      {(ordersData?.data ?? MOCK_ORDERS).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.po_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {/* Delivery date */}
                <FormField label="Delivery date">
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    placeholder="dd/mm/yyyy"
                  />
                </FormField>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold">
                  Invoice Items{" "}
                  <span className="text-muted-foreground font-normal ml-1">
                    {items.length}
                  </span>
                </h2>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Quantity", "Unit Price", "Total", ""].map((col, i) => (
                        <th
                          key={i}
                          className="px-5 py-3 text-left text-xs font-medium text-muted-foreground"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/60">
                        {/* Name */}
                        <td className="px-5 py-2.5">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            placeholder="Enter item name..."
                            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-32"
                          />
                        </td>
                        {/* Quantity stepper */}
                        <td className="px-5 py-2.5">
                          <div className="flex items-center border border-border rounded-lg overflow-hidden w-20">
                            <button
                              onClick={() =>
                                updateItem(item.id, "quantity", Math.max(0, item.quantity - 1))
                              }
                              className="px-2 py-1.5 hover:bg-muted text-muted-foreground"
                            >
                              ‹
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(item.id, "quantity", parseInt(e.target.value) || 0)
                              }
                              className="w-8 text-center text-sm py-1 border-x border-border focus:outline-none"
                              min={0}
                            />
                            <button
                              onClick={() =>
                                updateItem(item.id, "quantity", item.quantity + 1)
                              }
                              className="px-2 py-1.5 hover:bg-muted text-muted-foreground"
                            >
                              ›
                            </button>
                          </div>
                        </td>
                        {/* Unit price */}
                        <td className="px-5 py-2.5">
                          <div className="flex items-center border border-border rounded-lg overflow-hidden w-28">
                            <span className="px-2 text-sm text-muted-foreground border-r border-border py-1.5">
                              ₦
                            </span>
                            <input
                              type="number"
                              value={item.unit_price || ""}
                              onChange={(e) =>
                                updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)
                              }
                              placeholder="0.00"
                              className="flex-1 text-sm px-2 py-1.5 focus:outline-none w-16"
                              min={0}
                            />
                            <button
                              onClick={() =>
                                updateItem(item.id, "unit_price", item.unit_price + 1000)
                              }
                              className="px-1.5 py-1.5 hover:bg-muted text-muted-foreground border-l border-border"
                            >
                              ›
                            </button>
                          </div>
                        </td>
                        {/* Total */}
                        <td className="px-5 py-2.5 text-sm font-medium whitespace-nowrap">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </td>
                        {/* Delete */}
                        <td className="px-5 py-2.5">
                          {items.length > 1 && (
                            <button
                              onClick={() => removeItem(item.id)}
                              className="p-1 text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add item row */}
              <div className="px-5 py-3 border-t border-border">
                <button
                  onClick={addItem}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </button>
              </div>
            </div>
          </div>

          {/* Right — Invoice summary card */}
          <div className="bg-navy rounded-2xl p-5 text-navy-foreground sticky top-20">
            <h3 className="text-base font-semibold mb-5">Invoice Summary</h3>

            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Tax ({TAX_RATE * 100}%)</span>
                <span className="font-medium">{formatCurrency(tax)}</span>
              </div>
              <div className="h-px bg-white/20 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">Total Amount</span>
                <span className="text-lg font-bold">{formatCurrency(total)}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full bg-primary hover:bg-primary/90"
              loading={isPending}
              onClick={handleSubmit}
              disabled={items.every((i) => !i.name)}
            >
              <ShieldCheck className="h-4 w-4" />
              {isEditing ? "Update Invoice" : "Submit Invoice"}
            </Button>
            <p className="text-xs text-white/50 text-center mt-2.5">
              Secure Submission via Villeto
            </p>
          </div>
        </div>
      </div>

      {/* Success modal */}
      <Dialog open={showSuccess} onOpenChange={(o) => !o && handleSuccessClose()}>
        <DialogContent size="sm" showClose>
          <div className="flex flex-col items-center text-center py-4">
            <div className="relative mb-5">
              {/* Confetti decorations */}
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
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
            </div>

            <h2 className="text-xl font-bold mb-2">Submitted Successfully</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your invoice has been sent for review and approval, you&apos;ll be
              notified of the progress.
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CreateInvoicePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <CreateInvoiceContent />
    </Suspense>
  );
}

const MOCK_ORDERS = [
  { id: "1", po_number: "PO-2024-001", organization: "ABC Enterprise", issue_date: "2025-09-26", priority: "low" as const, deadline: "2025-09-26", status: "delivered" as const, delivery_status: "delivered" as const, org_id: "org1", items: [{ id: "i1", name: "Heavy Duty Pallets", description: "Brief description", quantity: 10, unit_price: 2000, delivery_date: "2025-12-22" }], workflow: [] },
];
