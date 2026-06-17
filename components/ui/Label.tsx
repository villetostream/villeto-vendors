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
  /** Override the auto-generated id (rarely needed). */
  id?: string;
}

export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className,
  id: idProp,
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  // When the field's content is a single element (the overwhelmingly
  // common case — a bare <Input>, <CountrySelect>, etc.), wire it up to
  // the label and error/hint text automatically. Components that don't
  // declare an `id`/`aria-describedby` prop just ignore the extra
  // attribute (React passes unknown props through to the DOM node for
  // native elements, and our own components spread `...props`), so this
  // is safe even for the few inputs wrapped in an extra positioning
  // <div> — worst case it's a no-op there, never a regression.
  const content = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: (children.props as Record<string, unknown>).id ?? id,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {content}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
