"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check } from "lucide-react";
import { COUNTRIES, type Country } from "@/lib/constants/countries";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  value?: string;
  onChange: (country: Country) => void;
  error?: boolean;
  placeholder?: string;
}

interface DropdownPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

function FlagImg({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w40/${code.toLowerCase()}.png 2x`}
      width={20}
      height={15}
      alt=""
      className="rounded-sm object-cover shrink-0"
      style={{ minWidth: 20 }}
    />
  );
}

export function CountrySelect({
  value,
  onChange,
  error,
  placeholder = "Select country",
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find((c) => c.name === value);

  const filtered = search.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const MARGIN = 8;
    const MIN_HEIGHT = 160;
    const IDEAL_HEIGHT = 260;

    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;

    if (spaceBelow >= MIN_HEIGHT) {
      // Open downward — cap height to available space
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(IDEAL_HEIGHT, spaceBelow),
      });
    } else if (spaceAbove >= MIN_HEIGHT) {
      // Flip upward — anchor to bottom of the trigger
      setPos({
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(IDEAL_HEIGHT, spaceAbove),
      });
    } else {
      // Very little space — open downward but keep compact
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(MIN_HEIGHT, spaceBelow),
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, calcPos]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        !document.getElementById("country-dropdown")?.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 40);
  }, [open]);

  const handleSelect = (country: Country) => {
    onChange(country);
    setOpen(false);
    setSearch("");
  };

  const dropdown =
    open && pos
      ? createPortal(
          <div
            id="country-dropdown"
            style={{
              position: "fixed",
              ...(pos.top !== undefined ? { top: pos.top } : {}),
              ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
              maxHeight: pos.maxHeight,
            }}
            className="flex flex-col rounded-xl border border-border bg-white shadow-xl overflow-hidden"
          >
            {/* Search — sticky at top */}
            <div className="flex shrink-0 items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-white">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground text-xs leading-none"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No country found
                </div>
              ) : (
                filtered.map((country) => {
                  const isSelected = country.name === value;
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(country);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3.5 py-2 text-sm text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted/60 text-foreground"
                      )}
                    >
                      <FlagImg code={country.code} />
                      <span className="flex-1 truncate">{country.name}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          calcPos();
          setOpen((v) => !v);
        }}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all focus:outline-none",
          open
            ? "border-primary ring-2 ring-primary/20"
            : "border-border hover:border-primary/40",
          error && !open && "border-red-400 ring-2 ring-red-100"
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2.5 min-w-0">
            <FlagImg code={selected.code} />
            <span className="truncate text-foreground font-medium">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {dropdown}
    </div>
  );
}
