"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { DeliveryType, OrderLineItem } from "@/lib/types";

interface DeliveryModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmFull: () => void;
  onConfirmPartial: (items: { purchaseOrderLineItemId: string; deliveredQuantity: number }[]) => void;
  isPending: boolean;
}

export function DeliveryModal({
  open,
  onClose,
  onConfirmFull,
  onConfirmPartial: _onConfirmPartial,
  isPending,
}: DeliveryModalProps) {
  const [step, setStep] = useState<"select" | "partial">("select");
  const [selected, setSelected] = useState<DeliveryType | null>(null);

  const handleTypeSelect = (type: DeliveryType) => {
    setSelected(type);
    if (type === "full") {
      onConfirmFull();
    } else {
      setStep("partial");
    }
  };

  const handleClose = () => {
    setStep("select");
    setSelected(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="sm" showClose>
        {step === "select" ? (
          <div className="py-2">
            <DialogTitle className="text-base mb-1">Set as Delivered</DialogTitle>
            <DialogDescription className="mb-5">
              Select the type of delivery to confirm.
            </DialogDescription>
            <div className="space-y-3">
              <DeliveryOption
                type="full"
                title="Full Delivery"
                description="All items have been delivered in full."
                icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
                selected={selected === "full"}
                loading={isPending && selected === "full"}
                onClick={() => handleTypeSelect("full")}
              />
              <DeliveryOption
                type="partial"
                title="Partial Delivery"
                description="Some items were delivered. Enter quantities below."
                icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
                selected={selected === "partial"}
                loading={false}
                onClick={() => handleTypeSelect("partial")}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Individual option card ───────────────────
function DeliveryOption({
  type: _type, title, description, icon, selected, loading, onClick,
}: {
  type: DeliveryType;
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:border-primary/30 hover:bg-muted/40"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {loading && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
      )}
    </button>
  );
}

// ─── Partial Delivery Panel (inline in order detail page) ─────────────────────

interface PartialDeliveryPanelProps {
  items: OrderLineItem[];
  onConfirm: (items: { purchaseOrderLineItemId: string; deliveredQuantity: number }[]) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function PartialDeliveryPanel({
  items,
  onConfirm,
  onCancel,
  isPending,
}: PartialDeliveryPanelProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.purchaseOrderLineItemId, 0]))
  );

  const handleQuantityChange = (id: string, value: number, max: number) => {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(max, value)),
    }));
  };

  const hasAnyQuantity = Object.values(quantities).some((q) => q > 0);

  const handleConfirm = () => {
    const payload = Object.entries(quantities).map(([id, deliveredQuantity]) => ({
      purchaseOrderLineItemId: id,
      deliveredQuantity,
    }));
    onConfirm(payload);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Enter the quantity you delivered below
      </p>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Name", "Description", "Quantity", "Delivery date"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.purchaseOrderLineItemId} className="border-b border-border/60">
                <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{item.description}</td>
                <td className="px-4 py-3">
                  {/* Stepper input */}
                  <div className="flex items-center border border-border rounded-lg overflow-hidden w-24">
                    <button
                      onClick={() => handleQuantityChange(item.purchaseOrderLineItemId, quantities[item.purchaseOrderLineItemId] - 1, item.quantity)}
                      className="px-2 py-1 hover:bg-muted transition-colors text-muted-foreground text-lg leading-none"
                    >
                      ‹
                    </button>
                    <input
                      type="number"
                      value={quantities[item.purchaseOrderLineItemId]}
                      onChange={(e) => handleQuantityChange(item.purchaseOrderLineItemId, parseInt(e.target.value) || 0, item.quantity)}
                      className="flex-1 text-center text-sm py-1 border-x border-border focus:outline-none w-10"
                      min={0}
                      max={item.quantity}
                    />
                    <button
                      onClick={() => handleQuantityChange(item.purchaseOrderLineItemId, quantities[item.purchaseOrderLineItemId] + 1, item.quantity)}
                      className="px-2 py-1 hover:bg-muted transition-colors text-muted-foreground text-lg leading-none"
                    >
                      ›
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {item.deliveryDate ?? "2024-04-15"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="px-6">
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!hasAnyQuantity}
          loading={isPending}
          onClick={handleConfirm}
        >
          Confirm Delivery
        </Button>
      </div>
    </div>
  );
}
