import type { Day } from "@/lib/dates";
import { DEFAULT_FILTERS, linkTo } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import { type Attention, computeStats, type GigRow, jobsOverTime, nextJob } from "@/lib/stats";
import { JobsChart } from "./JobsChart";
import { LeadTimes } from "./LeadTimes";
import { NeedsAttention } from "./NeedsAttention";
import { FilterLink } from "./Pending";
import { StatTile } from "./StatTile";

const TILE = "block rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-muted active:bg-bg";

const arrow = (
  <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
    <path d="M4.5 3 7.5 6 4.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function part(day: Day, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${day}T00:00:00Z`));
}

/** The next booked job itself. Tapping it opens its card on the Gigs tab. */
function NextGig({ gig, more }: { gig: GigRow | null; more: number }) {
  if (!gig) {
    return (
      <FilterLink href={linkTo({ tab: "gigs" })} className={`${TILE} row-span-2`}>
        <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted">Upcoming gig {arrow}</p>
        <p className="mt-2 text-sm text-muted">Nothing booked yet.</p>
      </FilterLink>
    );
  }
  return (
    <FilterLink href={`${linkTo({ tab: "gigs" })}#gig-${gig.uid}`} className={`${TILE} row-span-2 flex flex-col`}>
      <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted">Upcoming gig {arrow}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{part(gig.gigDate, { month: "short", day: "numeric" })}</p>
      <p className="text-xs text-muted">{part(gig.gigDate, { weekday: "long" })}</p>
      <p className="mt-3 truncate font-semibold">{gig.person ?? gig.title}</p>
      <p className="truncate text-sm text-muted">{gig.location ?? "No location"}</p>
      <p className="mt-auto pt-3 text-lg font-semibold tabular-nums">
        {gig.price === null ? <span className="text-sm font-normal text-muted">No price</span> : formatMoney(gig.price)}
      </p>
      {more > 0 && <p className="text-xs text-muted">+{plural(more, "more job")} booked</p>}
    </FilterLink>
  );
}

/** The Overview tab: the next gig, this month's money, holds, lead times and the jobs chart. */
export function OverviewView({
  rows,
  today,
  attention,
  calendars,
}: {
  rows: GigRow[];
  today: Day;
  attention: Attention;
  calendars: Parameters<typeof NeedsAttention>[0]["names"];
}) {
  const { tiles } = computeStats(rows, DEFAULT_FILTERS, today);
  const month = computeStats(rows, { ...DEFAULT_FILTERS, range: "month" }, today).tiles;
  const next = nextJob(rows, today);
  const toFix = attention.unreadable.length + attention.mismatched.length + attention.recurring.length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <NextGig gig={next} more={Math.max(0, tiles.upcomingJobs - 1)} />
        <StatTile
          label="Earned this month"
          value={formatMoney(month.earned)}
          sub={month.upcoming > 0 ? `+${formatMoney(month.upcoming)} upcoming` : "From jobs played"}
          href={linkTo({ tab: "gigs", range: "month", when: "all", show: "job" })}
        />
        <StatTile
          label="Holds"
          value={tiles.openHolds.toLocaleString("en-US")}
          sub={tiles.holdRate === null ? "Still open" : `Open · ${Math.round(tiles.holdRate * 100)}% became jobs`}
          href={linkTo({ tab: "gigs", show: "hold" })}
        />
      </div>
      {tiles.leadCounted > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-3">
          <h2 className="mb-2 px-1 text-xs font-medium text-muted">Lead times · how far ahead jobs are booked</h2>
          <LeadTimes lead={tiles} />
        </section>
      )}
      <JobsChart
        months={jobsOverTime(rows, "month", today)}
        years={jobsOverTime(rows, "year", today)}
        now={today}
      />
      {tiles.wanted > 0 && (
        <FilterLink
          href={linkTo({ tab: "gigs", when: "all", show: "wanted" })}
          className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:border-muted active:bg-bg"
        >
          <span>Asked, but not free</span>
          <span className="font-semibold tabular-nums">{tiles.wanted.toLocaleString("en-US")}</span>
        </FilterLink>
      )}
      {(tiles.unpriced > 0 || toFix > 0) && (
        <p className="px-1 text-xs text-muted">
          {tiles.unpriced > 0 &&
            `${plural(tiles.unpriced, "job")} with no price ${tiles.unpriced === 1 ? "isn't" : "aren't"} counted in the money. `}
          {toFix > 0 && (
            <a href="#attention" className="text-accent">
              {plural(toFix, "title")} {toFix === 1 ? "needs" : "need"} a look.
            </a>
          )}
        </p>
      )}
      {toFix > 0 && <NeedsAttention attention={attention} names={calendars} />}
    </>
  );
}
