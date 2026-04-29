import { cn } from "@/lib/utils";
import { AlertCircle, Inbox } from "lucide-react";

// ─── Spinner ─────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-primary",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

// ─── Empty State ──────────────────────────────
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
        {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Error State ──────────────────────────────
export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 mb-4">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
