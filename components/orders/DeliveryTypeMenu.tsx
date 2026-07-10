"use client";

import { CheckCircle2, PackageCheck, Loader2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { DeliveryType } from "@/lib/types";

interface DeliveryTypeMenuProps {
  onSelect: (type: DeliveryType) => void;
  isConfirmingFull: boolean;
  trigger: React.ReactNode;
}

/**
 * "Full Delivery" fires the confirm-delivery call immediately (quantities
 * are never editable for a full delivery — there's nothing to enter).
 * "Partial Delivery" just closes the popover and hands control back to
 * the order detail page, which switches into its editable-quantity view
 * (see OrderDetailPage's `deliveryMode` state) — that view owns its own
 * Confirm/Cancel actions, matching the "Order – Partial Delivery" mockup.
 */
export function DeliveryTypeMenu({ onSelect, isConfirmingFull, trigger }: DeliveryTypeMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-border bg-white shadow-lg p-1.5 animate-in fade-in-0 zoom-in-95"
        >
          <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
            How was this order delivered?
          </div>

          <DropdownMenu.Item
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm cursor-pointer outline-none hover:bg-muted transition-colors"
            disabled={isConfirmingFull}
            onSelect={(e) => {
              e.preventDefault();
              onSelect("full");
            }}
          >
            {isConfirmingFull ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium text-foreground">Full Delivery</p>
              <p className="text-xs text-muted-foreground">Every item delivered in full</p>
            </div>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm cursor-pointer outline-none hover:bg-muted transition-colors",
              isConfirmingFull && "opacity-50 pointer-events-none"
            )}
            onSelect={(e) => {
              e.preventDefault();
              onSelect("partial");
            }}
          >
            <PackageCheck className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Partial Delivery</p>
              <p className="text-xs text-muted-foreground">Enter quantity delivered per item</p>
            </div>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
