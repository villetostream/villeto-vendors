"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  prefix?: string;
  prefixClass?: string;
}

export function ExpandableText({
  text,
  maxLength = 75,
  className,
  prefix,
  prefixClass,
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const trimmed = text?.trim() || "";
  const isLong = trimmed.length > maxLength;

  if (!trimmed) return null;

  return (
    <div className={cn("text-[11px] leading-relaxed break-words", className)}>
      {prefix && <span className={cn("font-semibold mr-1", prefixClass)}>{prefix}</span>}
      <span>{isExpanded || !isLong ? trimmed : `${trimmed.slice(0, maxLength).trim()}...`}</span>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          className="ml-1 text-[11px] font-semibold underline hover:opacity-80 cursor-pointer inline-flex items-center text-inherit"
        >
          {isExpanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

