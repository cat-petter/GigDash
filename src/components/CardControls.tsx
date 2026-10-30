"use client";

import { type FormEvent, useState } from "react";
import { type Filters, RANGES, type RangeKey, rangeLabel, withFilter } from "@/lib/filters";
import type { FilterOption } from "@/lib/stats";
import { usePending } from "./Pending";

const chevron = (
  <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** The name at the top of a card. Tap it to switch to another musician or place. */
export function NamePicker({
  filters,
  field,
  label,
  options,
}: {
  filters: Filters;
  field: "person" | "location";
  label: string;
  options: FilterOption[];
}) {
  const { navigate } = usePending();
  const current = filters[field] ?? "";
  return (
    <label className="relative inline-flex max-w-full min-w-0 items-center gap-1.5 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent">
      <span className="truncate text-xl font-semibold">{label}</span>
      {chevron}
      <select
        aria-label={field === "person" ? "Musician" : "Location"}
        value={current}
        onChange={(event) => navigate(withFilter(filters, { [field]: event.target.value }), { scroll: false })}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** From and To, applied together. */
export function DatesForm({ filters, onApply }: { filters: Filters; onApply: (from: string | null, to: string | null) => void }) {
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onApply(String(data.get("from") ?? "") || null, String(data.get("to") ?? "") || null);
  }
  return (
    <form key={`${filters.from}-${filters.to}`} onSubmit={apply} className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-muted">From</span>
        <input type="date" name="from" defaultValue={filters.from ?? ""} className="rounded-lg border border-line bg-bg px-2 py-1" />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-muted">To</span>
        <input type="date" name="to" defaultValue={filters.to ?? ""} className="rounded-lg border border-line bg-bg px-2 py-1" />
      </label>
      <button type="submit" className="rounded-full bg-fg px-4 py-1.5 font-medium text-bg">
        Apply
      </button>
    </form>
  );
}

/** Custom dates for the busiest card. */
export function CustomDates({ filters }: { filters: Filters }) {
  const { navigate } = usePending();
  return (
    <DatesForm
      filters={filters}
      onApply={(from, to) => navigate(withFilter(filters, { range: "custom", from, to }), { scroll: false })}
    />
  );
}

/** Which dates a card covers: All time, This month, Last 6 months, This year, Last 12 months or custom dates. */
export function RangePicker({ filters }: { filters: Filters }) {
  const { navigate } = usePending();
  const [customChosen, setCustomChosen] = useState(false);
  const custom = customChosen || filters.range === "custom";
  const go = (change: Partial<Filters>) => navigate(withFilter(filters, change), { scroll: false });

  function onRange(value: string) {
    if (value === "custom") setCustomChosen(true);
    else {
      setCustomChosen(false);
      go({ range: value as RangeKey, from: null, to: null });
    }
  }

  return (
    <div className="space-y-2">
      <label
        className={`relative inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-surface py-1.5 pr-2.5 pl-3 text-sm has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent ${
          filters.range === "all" && !customChosen ? "border-line" : "border-accent font-medium"
        }`}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="truncate">{customChosen && filters.range !== "custom" ? "Custom dates" : rangeLabel(filters)}</span>
        {chevron}
        <select
          aria-label="Dates"
          value={custom ? "custom" : filters.range}
          onChange={(event) => onRange(event.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {RANGES.map((range) => (
            <option key={range.key} value={range.key}>
              {range.label}
            </option>
          ))}
        </select>
      </label>
      {custom && <DatesForm filters={filters} onApply={(from, to) => go({ range: "custom", from, to })} />}
    </div>
  );
}
