"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { DayPicker, CaptionProps, useNavigation } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/Button"

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  fromYear?: number
  toYear?: number
}

const MONTHS = [
  { full: "January", short: "Jan" },
  { full: "February", short: "Feb" },
  { full: "March", short: "Mar" },
  { full: "April", short: "Apr" },
  { full: "May", short: "May" },
  { full: "June", short: "Jun" },
  { full: "July", short: "Jul" },
  { full: "August", short: "Aug" },
  { full: "September", short: "Sep" },
  { full: "October", short: "Oct" },
  { full: "November", short: "Nov" },
  { full: "December", short: "Dec" },
]

function CustomCaption({
  displayMonth,
  fromYear = 1950,
  toYear = new Date().getFullYear() + 30,
}: CaptionProps & { fromYear?: number; toYear?: number }) {
  const { goToMonth, previousMonth, nextMonth } = useNavigation()
  const [openMenu, setOpenMenu] = React.useState<"month" | "year" | null>(null)
  const [yearSearch, setYearSearch] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const activeYearRef = React.useRef<HTMLButtonElement>(null)
  const yearInputRef = React.useRef<HTMLInputElement>(null)

  const currentMonthIndex = displayMonth.getMonth()
  const currentYear = displayMonth.getFullYear()

  const years = React.useMemo(() => {
    const list: number[] = []
    for (let y = fromYear; y <= toYear; y++) {
      list.push(y)
    }
    return list
  }, [fromYear, toYear])

  const filteredYears = React.useMemo(() => {
    const q = yearSearch.trim()
    if (!q) return years
    return years.filter((y) => String(y).includes(q))
  }, [years, yearSearch])

  React.useEffect(() => {
    if (openMenu === "year") {
      setYearSearch("")
      requestAnimationFrame(() => {
        activeYearRef.current?.scrollIntoView({ block: "center" })
        yearInputRef.current?.focus()
      })
    }
  }, [openMenu])

  React.useEffect(() => {
    if (!openMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openMenu])

  const handleSelectMonth = (monthIdx: number) => {
    goToMonth(new Date(currentYear, monthIdx, 1))
    setOpenMenu(null)
  }

  const handleSelectYear = (year: number) => {
    goToMonth(new Date(year, currentMonthIndex, 1))
    setOpenMenu(null)
  }

  return (
    <div ref={containerRef} className="relative flex items-center justify-between pt-1 px-1">
      <button
        type="button"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        aria-label="Previous month"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 disabled:opacity-25 shrink-0"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Interactive Month & Year Pickers */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === "month" ? null : "month"))}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer",
            openMenu === "month"
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-muted"
          )}
        >
          <span>{MONTHS[currentMonthIndex]?.full}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-60 transition-transform",
              openMenu === "month" && "rotate-180 opacity-100"
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === "year" ? null : "year"))}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer",
            openMenu === "year"
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-muted"
          )}
        >
          <span>{currentYear}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-60 transition-transform",
              openMenu === "year" && "rotate-180 opacity-100"
            )}
          />
        </button>
      </div>

      <button
        type="button"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        aria-label="Next month"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 disabled:opacity-25 shrink-0"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Month Quick-Picker Popover */}
      {openMenu === "month" && (
        <div className="absolute left-0 right-0 top-9 z-30 rounded-xl border border-border bg-white p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, idx) => {
              const isSelected = idx === currentMonthIndex
              return (
                <button
                  key={m.short}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={cn(
                    "py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {m.short}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Year Quick-Picker Popover */}
      {openMenu === "year" && (
        <div className="absolute left-0 right-0 top-9 z-30 rounded-xl border border-border bg-white p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <input
            ref={yearInputRef}
            type="text"
            inputMode="numeric"
            value={yearSearch}
            onChange={(e) => setYearSearch(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredYears.length > 0) {
                e.preventDefault()
                const exact = filteredYears.find((y) => String(y) === yearSearch.trim())
                handleSelectYear(exact ?? filteredYears[0])
              } else if (e.key === "Escape") {
                setOpenMenu(null)
              }
            }}
            placeholder="Type year (e.g. 2010, 2030)..."
            className="w-full mb-1.5 px-2.5 py-1 text-xs rounded-lg border border-border bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="max-h-44 overflow-y-auto grid grid-cols-3 gap-1 pr-0.5">
            {filteredYears.length > 0 ? (
              filteredYears.map((y) => {
                const isSelected = y === currentYear
                return (
                  <button
                    key={y}
                    ref={isSelected ? activeYearRef : undefined}
                    type="button"
                    onClick={() => handleSelectYear(y)}
                    className={cn(
                      "py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    {y}
                  </button>
                )
              })
            ) : (
              <p className="col-span-3 py-3 text-center text-xs text-muted-foreground">
                No matching year
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  fromYear = 1950,
  toYear = new Date().getFullYear() + 30,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: (captionProps) => (
          <CustomCaption {...captionProps} fromYear={fromYear} toYear={toYear} />
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
