"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import {
  DEFAULT_FILTERS,
  extraFilterCount,
  type Filters,
  isFiltered,
  LEAD_BUCKETS,
  type LeadKey,
  RANGES,
  type RangeKey,
  withFilter,
} from "@/lib/filters";
import type { FilterOption } from "@/lib/stats";
import { FilterLink, usePending } from "./Pending";

type Props = {
  filters: Filters;
  people: FilterOption[];
  locations: FilterOption[];
};

const chevron = (
  <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** Adds the current choice if it's no longer in the list, e.g. from an old bookmark. */
function withCurrent(options: FilterOption[], current: string | null): FilterOption[] {
  if (!current || options.some((option) => option.key === current)) return options;
  return [...options, { key: current, label: current, count: 0 }];
}

/** A labeled native select, so the phone opens its own picker. */
function Field({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="relative flex items-center">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none truncate rounded-lg border border-line bg-bg py-2 pr-8 pl-3 text-sm"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3">{chevron}</span>
      </span>
    </label>
  );
}

/** A filter that's on, with an × to turn it off. */
function Chip({ children, href }: { children: ReactNode; href: string }) {
  return (
    <FilterLink
      href={href}
      scroll={false}
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/12 py-1 pr-2 pl-3 text-sm text-accent"
    >
      <span className="truncate">{children}</span>
      <svg aria-label="Remove" viewBox="0 0 12 12" className="size-3 shrink-0">
        <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </FilterLink>
  );
}

export function FilterBar({ filters, people, locations }: Props) {
  const { navigate } = usePending();
  const [open, setOpen] = useState(false);
  // "Custom dates" shows the date fields; the range changes once they're applied.
  const [customChosen, setCustomChosen] = useState(false);
  const customOpen = customChosen || filters.range === "custom";
  const go = (change: Partial<Filters>) => navigate(withFilter(filters, change), { scroll: false });
  const nameOf = (options: { key: string; label: string }[], key: string) =>
    options.find((option) => option.key === key)?.label ?? key;
  const extra = extraFilterCount(filters);

  function onRange(value: string) {
    if (value === "custom") setCustomChosen(true);
    else {
      setCustomChosen(false);
      go({ range: value as RangeKey, from: null, to: null });
    }
  }

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") ?? "") || null;
    const to = String(data.get("to") ?? "") || null;
    go({ range: "custom", from, to });
  }

  const pill = "rounded-full border bg-surface py-1.5 text-sm";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label
          className={`${pill} relative inline-flex min-w-0 items-center gap-1.5 pr-2.5 pl-3 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent ${
            filters.range !== DEFAULT_FILTERS.range ? "border-accent font-medium" : "border-line"
          }`}
        >
          <span className="truncate">{nameOf(RANGES, customOpen ? "custom" : filters.range)}</span>
          {chevron}
          <select
            aria-label="Dates"
            value={customOpen ? "custom" : filters.range}
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
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`${pill} inline-flex items-center gap-1.5 px-3 ${extra ? "border-accent font-medium" : "border-line"}`}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 text-muted">
            <path d="M2 4h12M4.5 8h7M7 12h2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Filter
          {extra > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-xs leading-5 font-semibold text-bg">{extra}</span>
          )}
        </button>
        {isFiltered(filters) && (
          <FilterLink
            href={withFilter(DEFAULT_FILTERS, {})}
            scroll={false}
            onClick={() => setCustomChosen(false)}
            className="ml-auto px-1 text-sm text-accent"
          >
            Clear
          </FilterLink>
        )}
      </div>

      {customOpen && (
        <form key={`${filters.from}-${filters.to}`} onSubmit={applyDates} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              className="rounded-lg border border-line bg-surface px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              className="rounded-lg border border-line bg-surface px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded-full bg-fg px-4 py-1.5 font-medium text-bg">
            Apply
          </button>
        </form>
      )}

      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-3">
          <Field label="Person" value={filters.person ?? ""} onChange={(value) => go({ person: value || null })}>
            <option value="">Everyone</option>
            {withCurrent(people, filters.person).map((person) => (
              <option key={person.key} value={person.key}>
                {person.label}
              </option>
            ))}
          </Field>
          <Field label="Location" value={filters.location ?? ""} onChange={(value) => go({ location: value || null })}>
            <option value="">Everywhere</option>
            {withCurrent(locations, filters.location).map((location) => (
              <option key={location.key} value={location.key}>
                {location.label}
              </option>
            ))}
          </Field>
          <Field
            label="Booked ahead"
            value={filters.lead ?? ""}
            onChange={(value) => go({ lead: (value || null) as LeadKey | null })}
          >
            <option value="">Any time</option>
            {LEAD_BUCKETS.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label}
              </option>
            ))}
          </Field>
        </div>
      )}

      {!open && extra > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.person && (
            <Chip href={withFilter(filters, { person: null })}>{nameOf(withCurrent(people, filters.person), filters.person)}</Chip>
          )}
          {filters.location && (
            <Chip href={withFilter(filters, { location: null })}>
              {nameOf(withCurrent(locations, filters.location), filters.location)}
            </Chip>
          )}
          {filters.lead && (
            <Chip href={withFilter(filters, { lead: null })}>
              Booked {nameOf(LEAD_BUCKETS, filters.lead).toLowerCase()} ahead
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}
