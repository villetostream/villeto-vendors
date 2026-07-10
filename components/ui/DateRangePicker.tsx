"use client";

import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const presets = [
  {
    label: "Yesterday",
    getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }),
  },
  {
    label: "Last 7 days",
    getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: "Last 30 days",
    getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: "This month",
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
];

interface DateRangePickerProps {
  date?: DateRange;
  onSelect: (date: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  date,
  onSelect,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-colors text-xs cursor-pointer",
            !date && "text-muted-foreground",
            open ? "bg-muted border-primary" : "bg-white border-border hover:bg-muted/50 text-foreground",
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline whitespace-nowrap">
            {date?.from ? (
              date.to && !isSameDay(date.from, date.to) ? (
                <>
                  {format(date.from, "MMM dd, yyyy")} -{" "}
                  {format(date.to, "MMM dd, yyyy")}
                </>
              ) : (
                format(date.from, "MMM dd, yyyy")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 hidden sm:inline" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex flex-col sm:flex-row" align="end">
        {/* Presets Sidebar */}
        <div className="flex flex-col gap-1 p-3 border-b sm:border-b-0 sm:border-r border-border min-w-[140px]">
          <span className="text-xs font-semibold text-muted-foreground px-2 pb-1 uppercase tracking-wider">
            Presets
          </span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
              onClick={() => {
                onSelect(preset.getValue());
                setOpen(false);
              }}
            >
              {preset.label}
            </button>
          ))}
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            className="text-left px-3 py-2 text-sm rounded-lg bg-primary/5 text-primary font-medium"
          >
            Custom Range
          </button>
        </div>

        {/* Calendar */}
        <div className="p-1">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onSelect}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
