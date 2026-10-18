"use client";

import { useState } from "react";
import { type Day, dayToDate } from "@/lib/dates";
import type { Status } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
import { Card } from "./Card";

export type GigListItem = {
  uid: string;
  gigDate: Day;
  title: string;
  person: string | null;
  location: string | null;
  price: number | null;
  leadDays: number | null;
  status: Status;
};

const SLOT: Record<Status, number> = { job: 1, hold: 2, wanted: 3 };

type SortKey = "date" | "person" | "price" | "lead";
const FIRST_PAGE = 20;
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

const COLUMNS: { key: SortKey; label: string; title?: string; align: "left" | "right" }[] = [
  { key: "date", label: "Date", align: "left" },
  { key: "person", label: "Who and where", align: "left" },
  { key: "price", label: "Price", align: "right" },
  { key: "lead", label: "Lead", title: "Days booked ahead", align: "right" },
];

function valueOf(gig: GigListItem, key: SortKey): string | number | null {
  switch (key) {
    case "date":
      return gig.gigDate;
    case "person":
      return gig.person?.toLowerCase() ?? null;
    case "price":
      return gig.price;
    case "lead":
      return gig.leadDays;
  }
}

/** Sorts by `key`, with gigs missing that value always last. */
function sortGigs(gigs: GigListItem[], key: SortKey, descending: boolean): GigListItem[] {
  return [...gigs].sort((a, b) => {
    const [x, y] = [valueOf(a, key), valueOf(b, key)];
    if (x === null || y === null) return x === y ? b.gigDate.localeCompare(a.gigDate) : x === null ? 1 : -1;
    const order = x < y ? -1 : x > y ? 1 : b.gigDate.localeCompare(a.gigDate);
    return descending && x !== y ? -order : order;
  });
}

export function GigTable({ gigs }: { gigs: GigListItem[] }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "date", descending: true });
  const [showAll, setShowAll] = useState(false);
  const sorted = sortGigs(gigs, sort.key, sort.descending);
  const visible = showAll ? sorted : sorted.slice(0, FIRST_PAGE);

  function sortBy(key: SortKey) {
    // Names start A→Z; dates, prices and lead times start with the biggest.
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : key !== "person" }));
  }

  return (
    <Card title="Gigs" note={`${gigs.length.toLocaleString("en-US")} in this view. Tap a column to sort.`}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    aria-sort={active ? (sort.descending ? "descending" : "ascending") : undefined}
                    className={`px-1 py-1.5 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}
                  >
                    <button
                      type="button"
                      title={column.title}
                      onClick={() => sortBy(column.key)}
                      className={`inline-flex items-center gap-0.5 ${active ? "text-fg" : ""}`}
                    >
                      {column.label}
                      <span aria-hidden className={active ? "" : "invisible"}>
                        {sort.descending ? "↓" : "↑"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((gig) => (
              <tr key={gig.uid} className="align-top">
                <td className="px-1 py-2 whitespace-nowrap">
                  {monthDay.format(dayToDate(gig.gigDate))}
                  <span className="block text-xs text-muted">{gig.gigDate.slice(0, 4)}</span>
                </td>
                <td className="px-1 py-2">
                  <span className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-[2px]"
                      style={{ background: `var(--series-${SLOT[gig.status]})` }}
                    />
                    <span className="min-w-0 break-words">
                      {gig.person ?? <span className="text-muted italic">{gig.title}</span>}
                      {gig.status !== "job" && <span className="text-muted"> · {gig.status}</span>}
                    </span>
                  </span>
                  {gig.location && <span className="block pl-3.5 text-xs text-muted">{gig.location}</span>}
                </td>
                <td className="px-1 py-2 text-right">
                  {gig.price !== null ? formatMoney(gig.price) : <span className="text-muted">—</span>}
                </td>
                <td className="px-1 py-2 text-right">
                  {gig.leadDays !== null && gig.leadDays >= 0 ? `${gig.leadDays}d` : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > FIRST_PAGE && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-sm text-accent">
          {showAll ? "Show fewer" : `Show all ${sorted.length.toLocaleString("en-US")}`}
        </button>
      )}
    </Card>
  );
}
