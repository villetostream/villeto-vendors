import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
    required?: boolean;
  }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "block text-sm font-medium text-foreground mb-1.5",
      className
    )}
    {...props}
  >
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

// ─────────────────────────────────────────────

interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {hint && !error && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}
