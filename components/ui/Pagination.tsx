"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Max number of page-number buttons to render before truncating. */
  maxVisiblePages?: number;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  maxVisiblePages = 8,
}: PaginationProps) {
  const pages = useMemo(
    () => Array.from({ length: Math.min(totalPages, maxVisiblePages) }, (_, i) => i + 1),
    [totalPages, maxVisiblePages]
  );

  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <nav className="flex items-center gap-1" aria-label="Pagination">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
      >
        Previous
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          aria-label={`Page ${p}`}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            "h-8 w-8 text-sm rounded-lg border transition-colors",
            p === page
              ? "border-primary bg-primary text-white"
              : "border-border hover:bg-muted"
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
        disabled={page >= safeTotalPages}
        aria-label="Next page"
        className="px-3 py-1.5 text-sm rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
      >
        Next
      </button>
    </nav>
  );
}
