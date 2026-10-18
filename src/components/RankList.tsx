"use client";

import { useState } from "react";
import { type Filters, withFilter } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import type { Ranked } from "@/lib/stats";
import { FilterLink } from "./Pending";

type SortKey = "gigs" | "money" | "lead";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "gigs", label: "Gigs" },
  { key: "money", label: "Money" },
  { key: "lead", label: "Lead time" },
];
const FIRST_PAGE = 10;

function valueOf(row: Ranked, sort: SortKey): number | null {
  if (sort === "gigs") return row.jobs + row.holds + row.wanted;
  if (sort === "money") return row.dollars > 0 ? row.dollars : null;
  return row.leadMedian;
}

function shown(row: Ranked, sort: SortKey): string {
  const value = valueOf(row, sort);
  if (value === null) return "—";
  if (sort === "money") return formatMoney(value);
  if (sort === "lead") return plural(Math.round(value), "day");
  return value.toLocaleString("en-US");
}

function details(row: Ranked): string {
  const parts = [plural(row.jobs, "job")];
  if (row.holds) parts.push(plural(row.holds, "hold"));
  if (row.wanted) parts.push(`${row.wanted} wanted`);
  if (row.dollars) parts.push(formatMoney(row.dollars));
  if (row.leadMedian !== null) parts.push(`booked ${plural(Math.round(row.leadMedian), "day")} ahead`);
  return parts.join(" · ");
}

type Props = {
  rows: Ranked[];
  /** Tapping a row narrows the dashboard to that person or place. */
  field: "person" | "location";
  filters: Filters;
  empty: string;
};

/**
 * Everyone (or everywhere) in one list, with a thin bar for the chosen measure.
 * It replaces separate charts for gigs, money and lead time.
 */
export function RankList({ rows, field, filters, empty }: Props) {
  const [sort, setSort] = useState<SortKey>("gigs");
  const [all, setAll] = useState(false);

  if (rows.length === 0) return <p className="px-1 text-sm text-muted">{empty}</p>;

  const sorted = [...rows].sort((a, b) => {
    const x = valueOf(a, sort);
    const y = valueOf(b, sort);
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    return y - x;
  });
  const max = Math.max(1, ...sorted.map((row) => valueOf(row, sort) ?? 0));
  const kinds = (["jobs", "holds", "wanted"] as const).filter((kind) => rows.some((row) => row[kind] > 0));
  const mixed = kinds.length > 1;
  const visible = all ? sorted : sorted.slice(0, FIRST_PAGE);
  const countNote =
    sort === "money"
      ? "From jobs with a price."
      : sort === "lead"
        ? "Median days between booking and the gig."
        : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Sort by" className="inline-flex rounded-full border border-line bg-surface p-0.5">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={sort === option.key}
              onClick={() => setSort(option.key)}
              className={`rounded-full px-3 py-1 text-sm ${
                sort === option.key ? "bg-fg font-medium text-bg" : "text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {sort === "gigs" && mixed && (
          <p aria-hidden className="flex gap-3 text-xs text-muted">
            {kinds.map((kind) => (
              <span key={kind} className="flex items-center gap-1">
                <span className={`size-2.5 rounded-sm ${["bg-series-1", "bg-series-2", "bg-series-3"][["jobs", "holds", "wanted"].indexOf(kind)]}`} />
                {kind === "jobs" ? "Jobs" : kind === "holds" ? "Holds" : "Wanted"}
              </span>
            ))}
          </p>
        )}
      </div>
      {countNote && <p className="px-1 text-xs text-muted">{countNote}</p>}

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {visible.map((row) => {
          const value = valueOf(row, sort) ?? 0;
          const width = (value / max) * 100;
          return (
            <li key={row.key}>
              <FilterLink href={withFilter(filters, { [field]: row.key, tab: "overview" })} className="block px-4 py-3 hover:bg-[var(--hover)]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{row.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{shown(row, sort)}</span>
                </div>
                <div aria-hidden className="mt-1.5 flex h-1.5 gap-0.5" style={{ width: `${width}%` }}>
                  {sort === "gigs" ? (
                    ([["jobs", "bg-series-1"], ["holds", "bg-series-2"], ["wanted", "bg-series-3"]] as const).map(
                      ([kind, color]) =>
                        row[kind] > 0 && (
                          <span key={kind} className={`h-full rounded-full ${color}`} style={{ flexGrow: row[kind] }} />
                        ),
                    )
                  ) : (
                    <span className="h-full flex-1 rounded-full bg-series-1" />
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs text-muted">{details(row)}</p>
              </FilterLink>
            </li>
          );
        })}
      </ul>
      {sorted.length > FIRST_PAGE && (
        <button type="button" onClick={() => setAll(!all)} className="px-1 text-sm text-accent">
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}
