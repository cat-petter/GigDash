"use client";

import { useState } from "react";
import { FilterLink } from "./Pending";

export type PersonLeadRow = { key: string; label: string; href: string; count: number; average: number; median: number };

const FIRST_ROWS = 8;
const days = (value: number) => `${Math.round(value)}d`;

/** Lead time per person. Tapping a name filters the dashboard to them. */
export function PersonLeadTable({ rows }: { rows: PersonLeadRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, FIRST_ROWS);
  return (
    <>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-1 py-1.5 font-medium">Person</th>
              <th className="px-1 py-1.5 text-right font-medium">Gigs</th>
              <th className="px-1 py-1.5 text-right font-medium">Average</th>
              <th className="px-1 py-1.5 text-right font-medium">Median</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => (
              <tr key={row.key}>
                <td className="px-1 py-1.5">
                  <FilterLink href={row.href} className="text-accent">
                    {row.label}
                  </FilterLink>
                </td>
                <td className="px-1 py-1.5 text-right">{row.count}</td>
                <td className="px-1 py-1.5 text-right">{days(row.average)}</td>
                <td className="px-1 py-1.5 text-right">{days(row.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > FIRST_ROWS && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-sm text-accent">
          {showAll ? "Show fewer" : `Show all ${rows.length} people`}
        </button>
      )}
    </>
  );
}
