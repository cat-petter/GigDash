"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Day } from "@/lib/dates";
import { plural } from "@/lib/format";
import type { TimeBar } from "@/lib/stats";

const PLOT = 140;

/**
 * Jobs per month (or year) as bars that scroll sideways, opening on this month.
 * Just for looking: the bars don't open anything.
 */
export function JobsChart({ months, years, now }: { months: TimeBar[]; years: TimeBar[]; now: Day }) {
  const [per, setPer] = useState<"month" | "year">("month");
  const scroller = useRef<HTMLDivElement>(null);
  const bars = per === "month" ? months : years;
  const current = per === "month" ? now.slice(0, 7) : now.slice(0, 4);
  const max = Math.max(1, ...bars.map((bar) => bar.jobs));

  // Open on the current month (or year), centered when there's room either side.
  useLayoutEffect(() => {
    const box = scroller.current;
    const column = box?.querySelector<HTMLElement>(`[data-key="${current}"]`);
    if (!box || !column) return;
    box.scrollLeft = column.offsetLeft - box.clientWidth / 2 + column.offsetWidth / 2;
  }, [current, per]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Gigs</h2>
          <p className="mt-0.5 text-xs text-muted">Booked jobs per {per}. Swipe to see more.</p>
        </div>
        <div role="group" aria-label="Per" className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1 text-sm">
          {(["month", "year"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={per === option}
              onClick={() => setPer(option)}
              className={`rounded-lg px-3 py-1 font-medium ${per === option ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {option === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>
      </div>
      <div ref={scroller} className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]">
        <ol className="flex min-w-full items-end gap-1.5 border-b border-line" style={{ height: PLOT + 20 }}>
          {bars.map((bar) => {
            const height = bar.jobs ? Math.max(4, (bar.jobs / max) * PLOT) : 0;
            return (
              <li
                key={bar.key}
                data-key={bar.key}
                aria-label={`${bar.full}: ${plural(bar.jobs, "job")}`}
                className="flex w-11 shrink-0 flex-col items-center justify-end"
              >
                {bar.jobs > 0 && (
                  <span aria-hidden className="mb-1 text-[11px] font-semibold tabular-nums">
                    {bar.jobs}
                  </span>
                )}
                <span
                  aria-hidden
                  className={`w-7 rounded-t ${bar.key > current ? "bg-series-1/55" : "bg-series-1"}`}
                  style={{ height }}
                />
              </li>
            );
          })}
        </ol>
        <ol aria-hidden className="flex min-w-full gap-1.5 pt-1.5">
          {bars.map((bar, i) => (
            <li key={bar.key} className="w-11 shrink-0 text-center text-[11px] leading-tight tabular-nums">
              <span className={bar.key === current ? "font-semibold text-accent" : "text-muted"}>{bar.label}</span>
              {per === "month" && (i === 0 || bar.key.endsWith("-01")) && (
                <span className="block text-[10px] text-muted">{bar.key.slice(0, 4)}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
