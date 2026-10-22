"use client";

import { type Filters, SHOWS, type ShowKey, SORTS, type SortKey, WHENS, withFilter } from "@/lib/filters";
import { usePending } from "./Pending";
import { Segmented } from "./Segmented";

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center rounded-lg border border-line bg-surface has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full min-w-0 appearance-none truncate bg-transparent py-1.5 pr-7 pl-2.5 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 size-3 text-muted">
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </label>
  );
}

/** The Gigs tab's own choices: upcoming or completed, which calendar, and the order. */
export function GigControls({ filters }: { filters: Filters }) {
  const { navigate } = usePending();
  const go = (change: Partial<Filters>) => navigate(withFilter(filters, change), { scroll: false });
  return (
    <div className="space-y-2">
      <Segmented
        label="Which gigs"
        options={WHENS}
        current={filters.when}
        hrefOf={(when) => withFilter(filters, { when })}
      />
      <div className="flex gap-2">
        <Select<ShowKey> label="Show" value={filters.show} options={SHOWS} onChange={(show) => go({ show })} />
        <Select<SortKey> label="Sort by" value={filters.sort} options={SORTS} onChange={(sort) => go({ sort })} />
      </div>
    </div>
  );
}
