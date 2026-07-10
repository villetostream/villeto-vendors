"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  onSelect: (date?: Date) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
  error?: boolean;
}

export function DatePicker({
  date,
  onSelect,
  disabled,
  className,
  error,
}: DatePickerProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  return (
    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-11 px-4 flex items-center justify-between rounded-xl border bg-white text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-muted disabled:cursor-not-allowed cursor-pointer",
            !date && "text-muted-foreground",
            error
              ? "border-red-400 focus:ring-red-200 focus:border-red-400"
              : "border-border",
            className
          )}
        >
          <span>{date ? format(date, "PPP") : "Pick a date"}</span>
          <CalendarIcon className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onSelect(d);
            setCalendarOpen(false); // Auto-closes on select
          }}
          disabled={disabled}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
