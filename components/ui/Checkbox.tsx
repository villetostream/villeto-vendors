"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Custom accessible Checkbox with zero native browser checkbox styles.
 * Features smooth state transitions, branded active color (#00b29a), and sharp SVG icon.
 */
export function Checkbox({
  id,
  checked = false,
  onCheckedChange,
  disabled = false,
  className,
  label,
  description,
}: CheckboxProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onCheckedChange) {
      onCheckedChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (onCheckedChange) {
        onCheckedChange(!checked);
      }
    }
  };

  const checkboxControl = (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "h-5 w-5 rounded-md border flex items-center justify-center transition-all duration-150 shrink-0 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00b29a]/30 focus-visible:ring-offset-1",
        checked
          ? "bg-[#00b29a] border-[#00b29a] text-white shadow-xs"
          : "bg-white border-border hover:border-muted-foreground/50 hover:bg-slate-50/50",
        disabled && "opacity-50 cursor-not-allowed bg-muted/40 border-border/60",
        className
      )}
    >
      {checked && (
        <Check className="h-3.5 w-3.5 stroke-[3] text-white animate-in zoom-in-75 duration-100" />
      )}
    </button>
  );

  if (!label && !description) {
    return checkboxControl;
  }

  return (
    <div
      onClick={disabled ? undefined : handleClick}
      className={cn(
        "flex items-start gap-2.5 select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
    >
      <div className="pt-0.5">{checkboxControl}</div>
      <div className="space-y-0.5 min-w-0">
        {label && (
          <p className="text-xs font-medium text-foreground leading-tight">
            {label}
          </p>
        )}
        {description && (
          <p className="text-[11px] text-muted-foreground leading-normal">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
