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
 * Dropdown menu for selecting fulfillment declaration type.
 * Both options open the FulfillmentModal — "Full" pre-fills
 * all remaining quantities, "Partial" lets the vendor enter them.
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
            Select fulfillment type
          </div>

          <DropdownMenu.Item
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm cursor-pointer outline-none hover:bg-muted transition-colors"
            disabled={isConfirmingFull}
            onSelect={() => onSelect("full")}
          >
            {isConfirmingFull ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium text-foreground">Full — all items ready</p>
              <p className="text-xs text-muted-foreground">All remaining quantities declared ready</p>
            </div>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm cursor-pointer outline-none hover:bg-muted transition-colors",
              isConfirmingFull && "opacity-50 pointer-events-none"
            )}
            onSelect={() => onSelect("partial")}
          >
            <PackageCheck className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Partial — quantities will remain</p>
              <p className="text-xs text-muted-foreground">Enter quantity ready per item</p>
            </div>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
