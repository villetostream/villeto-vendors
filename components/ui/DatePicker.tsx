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
  isDisabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: boolean;
}

export function DatePicker({
  date,
  onSelect,
  disabled,
  isDisabled,
  placeholder = "dd/mm/yyyy",
  className,
  error,
}: DatePickerProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  return (
    <Popover open={isDisabled ? false : calendarOpen} onOpenChange={isDisabled ? undefined : setCalendarOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          className={cn(
            "w-full h-9 px-3 flex items-center justify-between rounded-lg border bg-white text-xs transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer",
            !date && "text-muted-foreground",
            error
              ? "border-red-400 focus:ring-red-200 focus:border-red-400"
              : "border-border/60",
            isDisabled && "bg-slate-100 text-slate-400 cursor-not-allowed border-border/40 opacity-60",
            className
          )}
        >
          <span>{date ? format(date, "dd/MM/yyyy") : placeholder}</span>
          <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onSelect(d);
            setCalendarOpen(false);
          }}
          disabled={disabled}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
