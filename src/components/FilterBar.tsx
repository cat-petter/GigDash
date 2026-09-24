"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import {
  DEFAULT_FILTERS,
  type Filters,
  isFiltered,
  LEAD_BUCKETS,
  type LeadKey,
  RANGES,
  type RangeKey,
  SHOW,
  type ShowKey,
  withFilter,
} from "@/lib/filters";
import type { FilterOption } from "@/lib/stats";
import { FilterLink, usePending } from "./Pending";

type Props = {
  filters: Filters;
  people: FilterOption[];
  locations: FilterOption[];
};

/**
 * A filter pill. It shows the current choice at its own width, with the native
 * select laid invisibly over it, so tapping opens the phone's own picker.
 */
function Pill({
  label,
  value,
  shown,
  changed,
  onChange,
  children,
}: {
  label: string;
  value: string;
  /** The label of the current choice. */
  shown: string;
  changed: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`relative inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-surface py-1.5 pr-2.5 pl-3 text-sm transition-colors has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent ${
        changed ? "border-accent font-medium" : "border-line"
      }`}
    >
      <span className="max-w-40 truncate">{shown}</span>
      <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {children}
      </select>
    </label>
  );
}

/** Adds the current choice if it's no longer in the list, e.g. from an old bookmark. */
function withCurrent(options: FilterOption[], current: string | null): FilterOption[] {
  if (!current || options.some((option) => option.key === current)) return options;
  return [...options, { key: current, label: current, count: 0 }];
}

export function FilterBar({ filters, people, locations }: Props) {
  const { navigate } = usePending();
  // "Custom dates" shows the date fields; the range changes once they're applied.
  const [customChosen, setCustomChosen] = useState(false);
  const customOpen = customChosen || filters.range === "custom";
  const go = (change: Partial<Filters>) => navigate(withFilter(filters, change), { scroll: false });
  const labelOf = (options: { key: string; label: string }[], key: string | null, fallback: string) =>
    key === null ? fallback : (options.find((option) => option.key === key)?.label ?? key);

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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          label="Dates"
          value={customOpen ? "custom" : filters.range}
          shown={labelOf(RANGES, customOpen ? "custom" : filters.range, "")}
          changed={filters.range !== DEFAULT_FILTERS.range}
          onChange={onRange}
        >
          {RANGES.map((range) => (
            <option key={range.key} value={range.key}>
              {range.label}
            </option>
          ))}
        </Pill>
        <Pill
          label="Person"
          value={filters.person ?? ""}
          shown={labelOf(people, filters.person, "Everyone")}
          changed={filters.person !== null}
          onChange={(value) => go({ person: value || null })}
        >
          <option value="">Everyone</option>
          {withCurrent(people, filters.person).map((person) => (
            <option key={person.key} value={person.key}>
              {person.label}
            </option>
          ))}
        </Pill>
        <Pill
          label="Location"
          value={filters.location ?? ""}
          shown={labelOf(locations, filters.location, "Everywhere")}
          changed={filters.location !== null}
          onChange={(value) => go({ location: value || null })}
        >
          <option value="">Everywhere</option>
          {withCurrent(locations, filters.location).map((location) => (
            <option key={location.key} value={location.key}>
              {location.label}
            </option>
          ))}
        </Pill>
        <Pill
          label="Jobs or holds"
          value={filters.show}
          shown={labelOf(SHOW, filters.show, "")}
          changed={filters.show !== DEFAULT_FILTERS.show}
          onChange={(value) => go({ show: value as ShowKey })}
        >
          {SHOW.map((show) => (
            <option key={show.key} value={show.key}>
              {show.label}
            </option>
          ))}
        </Pill>
        <Pill
          label="Lead time"
          value={filters.lead ?? ""}
          shown={filters.lead ? `Booked ${labelOf(LEAD_BUCKETS, filters.lead, "").toLowerCase()} ahead` : "Any lead time"}
          changed={filters.lead !== null}
          onChange={(value) => go({ lead: (value || null) as LeadKey | null })}
        >
          <option value="">Any lead time</option>
          {LEAD_BUCKETS.map((bucket) => (
            <option key={bucket.key} value={bucket.key}>
              Booked {bucket.label.toLowerCase()} ahead
            </option>
          ))}
        </Pill>
        {isFiltered(filters) && (
          <FilterLink
            href="/"
            scroll={false}
            onClick={() => setCustomChosen(false)}
            className="px-1 text-sm text-accent"
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
    </div>
  );
}
