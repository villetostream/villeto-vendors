import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full h-11 px-4 rounded-xl border bg-white text-sm text-foreground placeholder:text-muted-foreground",
          "transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
          error
            ? "border-red-400 focus:ring-red-200 focus:border-red-400"
            : "border-border",
          "disabled:bg-muted disabled:cursor-not-allowed",
          "read-only:bg-muted/50 read-only:cursor-default",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
