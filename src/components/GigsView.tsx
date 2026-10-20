import type { Day } from "@/lib/dates";
import type { Filters } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import type { GigRow } from "@/lib/stats";
import { GigCard } from "./GigCard";
import { GigControls } from "./GigControls";

const LONG_MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

type Month = { key: string; label: string; gigs: GigRow[] };

function byMonth(gigs: GigRow[]): Month[] {
  const months: Month[] = [];
  for (const gig of gigs) {
    const key = gig.gigDate.slice(0, 7);
    let month = months.at(-1);
    if (month?.key !== key) {
      month = { key, label: LONG_MONTH.format(new Date(`${key}-01T00:00:00Z`)), gigs: [] };
      months.push(month);
    }
    month.gigs.push(gig);
  }
  return months;
}

/** "3 booked · 1 on hold · $1,800" */
function summary(gigs: GigRow[]): string {
  const jobs = gigs.filter((gig) => gig.status === "job");
  const holds = gigs.filter((gig) => gig.status === "hold").length;
  const wanted = gigs.filter((gig) => gig.status === "wanted").length;
  const money = jobs.reduce((total, gig) => total + (gig.price ?? 0), 0);
  return [
    jobs.length > 0 && `${jobs.length} booked`,
    holds > 0 && `${holds} on hold`,
    wanted > 0 && `${wanted} asked, not free`,
    money > 0 && formatMoney(money),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The Gigs tab: a card per gig that matches the filters, by month when sorted by date. */
export function GigsView({
  gigs,
  filters,
  today,
  timeZone,
}: {
  gigs: GigRow[];
  filters: Filters;
  today: Day;
  timeZone: string;
}) {
  const card = (gig: GigRow) => (
    <li key={gig.uid}>
      <GigCard gig={gig} today={today} timeZone={timeZone} />
    </li>
  );
  const byDate = filters.sort === "date" || filters.sort === "date-desc";

  return (
    <>
      <GigControls filters={filters} />
      {gigs.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Nothing matches. Try {filters.when === "all" ? "a wider date range" : "All above"}, or clear the filters.
        </p>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            <span className="font-semibold text-fg">{plural(gigs.length, "gig")}</span> · {summary(gigs)}
          </p>
          {byDate ? (
            byMonth(gigs).map((month) => (
              <section key={month.key} aria-labelledby={`month-${month.key}`} className="space-y-2">
                <h2 id={`month-${month.key}`} className="flex items-baseline justify-between gap-3 px-1 pt-1">
                  <span className="font-semibold">{month.label}</span>
                  <span className="text-xs text-muted">{summary(month.gigs)}</span>
                </h2>
                <ul className="space-y-2">{month.gigs.map(card)}</ul>
              </section>
            ))
          ) : (
            <ul className="space-y-2">{gigs.map(card)}</ul>
          )}
        </>
      )}
    </>
  );
}
