import type { ReactNode } from "react";
import type { Day } from "@/lib/dates";
import { clearedFilters, type Filters, isFiltered, LEAD_BUCKETS, NONE_KEY, rangeLabel, withFilter } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import type { FilterOption, GigRow } from "@/lib/stats";
import { GigCard } from "./GigCard";
import { GigControls } from "./GigControls";
import { HashHighlight } from "./HashHighlight";
import { FilterLink } from "./Pending";

/** A narrowing that's on, e.g. from a Stats card, with an × to turn it off. */
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

const nameOf = (options: FilterOption[], key: string) =>
  options.find((option) => option.key === key)?.label ?? (key === NONE_KEY ? "No name" : key);

/** The dates, musician, place or lead time the list is narrowed to, each with an ×, and Clear. */
function Chips({ filters, people, places }: { filters: Filters; people: FilterOption[]; places: FilterOption[] }) {
  if (!isFiltered(filters)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.range !== "all" && (
        <Chip href={withFilter(filters, { range: "all", from: null, to: null })}>{rangeLabel(filters)}</Chip>
      )}
      {filters.person && <Chip href={withFilter(filters, { person: null })}>{nameOf(people, filters.person)}</Chip>}
      {filters.location && (
        <Chip href={withFilter(filters, { location: null })}>At {nameOf(places, filters.location)}</Chip>
      )}
      {filters.lead && (
        <Chip href={withFilter(filters, { lead: null })}>
          Lead time {LEAD_BUCKETS.find((bucket) => bucket.key === filters.lead)!.label.toLowerCase()}
        </Chip>
      )}
      <FilterLink href={withFilter(clearedFilters(filters), {})} scroll={false} className="ml-auto px-1 text-sm text-accent">
        Clear
      </FilterLink>
    </div>
  );
}

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
  people,
  places,
}: {
  gigs: GigRow[];
  filters: Filters;
  today: Day;
  timeZone: string;
  people: FilterOption[];
  places: FilterOption[];
}) {
  const card = (gig: GigRow) => (
    // The Overview's upcoming gig links here by id.
    <li key={gig.uid} id={`gig-${gig.uid}`} className="scroll-mt-6 rounded-2xl transition-shadow duration-500">
      <GigCard gig={gig} today={today} timeZone={timeZone} />
    </li>
  );
  const byDate = filters.sort === "date" || filters.sort === "date-desc";

  return (
    <>
      <HashHighlight />
      <GigControls filters={filters} />
      <Chips filters={filters} people={people} places={places} />
      {gigs.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Nothing matches.{" "}
          {filters.when !== "all" ? "Try All above." : isFiltered(filters) ? "Try Clear above." : ""}
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
