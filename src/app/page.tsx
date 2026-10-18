import Link from "next/link";
import { connection } from "next/server";
import { type BarRow, BarCard, type Series } from "@/components/BarCard";
import { Card } from "@/components/Card";
import { FilterBar } from "@/components/FilterBar";
import { GigTable } from "@/components/GigTable";
import { NeedsAttention } from "@/components/NeedsAttention";
import { FilterLink, PendingFrame, PendingProvider } from "@/components/Pending";
import { RankList } from "@/components/RankList";
import { StatTile } from "@/components/StatTile";
import { SyncButton } from "@/components/SyncButton";
import { TabBar } from "@/components/TabBar";
import { calendarNames, icloudConfigured } from "@/lib/caldav";
import { appTimeZone, dayInZone } from "@/lib/dates";
import { DEFAULT_FILTERS, parseFilters, withFilter } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import { loadGigRows } from "@/lib/gigs";
import { autoSync, syncStatus } from "@/lib/run-sync";
import { requireLogin } from "@/lib/session";
import { computeStats, filterOptions, needsAttention, type PeriodCount } from "@/lib/stats";

const JOBS: Series = { key: "jobs", one: "job", many: "jobs", color: "var(--series-1)" };
const HOLDS: Series = { key: "holds", one: "hold", many: "holds", color: "var(--series-2)" };
const WANTED: Series = { key: "wanted", one: "wanted date", many: "wanted dates", color: "var(--series-3)" };

function periodRows(periods: PeriodCount[]): BarRow[] {
  return periods.map((period) => ({
    key: period.key,
    label: period.label,
    full: period.full,
    values: { jobs: period.jobs, holds: period.holds, wanted: period.wanted },
  }));
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">{children}</p>;
}

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  await requireLogin("/");
  await connection();
  const filters = parseFilters(await searchParams);

  let timeZone = "America/New_York";
  let zoneProblem = false;
  try {
    timeZone = appTimeZone();
  } catch {
    zoneProblem = true;
  }

  const connected = icloudConfigured();
  if (connected) await autoSync(2000);

  const now = new Date();
  const [rows, sync] = await Promise.all([loadGigRows(), syncStatus(now)]);
  const today = dayInZone(now, timeZone);

  const header = (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Gigs</h1>
        <Link href="/status" className="text-sm text-accent">
          Status
        </Link>
      </div>
      <SyncButton {...sync} />
    </header>
  );

  const notices = (
    <>
      {!connected && (
        <Notice>
          iCloud isn&apos;t connected yet, so this only shows gigs that are already saved.{" "}
          <Link href="/status" className="underline">
            See Status
          </Link>
        </Notice>
      )}
      {zoneProblem && (
        <Notice>
          APP_TIMEZONE isn&apos;t a time zone this app knows, so dates are counted in New York time.{" "}
          <Link href="/status" className="underline">
            See Status
          </Link>
        </Notice>
      )}
    </>
  );

  if (rows.every((row) => row.deleted)) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        {header}
        {notices}
        <Card title="No gigs yet">
          <p className="text-sm text-muted">
            Once the app reads your calendars, your gigs show up here. Tap Sync now, or open{" "}
            <Link href="/status" className="text-accent">
              Status
            </Link>{" "}
            if nothing arrives.
          </p>
        </Card>
      </main>
    );
  }

  const stats = computeStats(rows, filters, today);
  const options = filterOptions(rows);
  const attention = needsAttention(rows);
  const { tiles } = stats;

  const countSeries =
    filters.show === "job" ? [JOBS] : filters.show === "hold" ? [HOLDS] : filters.show === "wanted" ? [WANTED] : [JOBS, HOLDS];
  const toFix = attention.unreadable.length + attention.mismatched.length + attention.recurring.length;
  const nothing = stats.gigs.length === 0 && tiles.jobs === 0 && tiles.openHolds === 0 && tiles.wanted === 0;

  const overview = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Upcoming jobs"
          value={tiles.upcomingJobs.toLocaleString("en-US")}
          sub={`${tiles.pastJobs} played · ${tiles.jobs} in all`}
        />
        <StatTile
          label="Earned"
          value={formatMoney(tiles.earned)}
          sub={tiles.upcoming > 0 ? `+${formatMoney(tiles.upcoming)} coming up` : "From jobs played"}
        />
        <StatTile
          label="Booked ahead"
          value={tiles.leadMedian === null ? "—" : plural(Math.round(tiles.leadMedian), "day")}
          sub={tiles.leadMedian === null ? "No booking dates yet" : "Typical (median)"}
        />
        <StatTile
          label="Holds"
          value={tiles.openHolds.toLocaleString("en-US")}
          sub={
            tiles.holdRate === null
              ? "Still open"
              : `Open · ${Math.round(tiles.holdRate * 100)}% became jobs`
          }
        />
      </div>
      {tiles.wanted > 0 && (
        <FilterLink
          href={withFilter(filters, { show: filters.show === "wanted" ? DEFAULT_FILTERS.show : "wanted" })}
          className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm hover:bg-[var(--hover)]"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm bg-series-3" />
            Wanted, but not free
          </span>
          <span className="text-muted">
            <span className="font-semibold text-fg tabular-nums">{tiles.wanted.toLocaleString("en-US")}</span>{" "}
            {filters.show === "wanted" ? "· show jobs and holds" : "· see who asked"}
          </span>
        </FilterLink>
      )}
      {(tiles.unpriced > 0 || toFix > 0) && (
        <p className="px-1 text-xs text-muted">
          {tiles.unpriced > 0 && `${plural(tiles.unpriced, "job")} with no price ${tiles.unpriced === 1 ? "isn't" : "aren't"} in Earned. `}
          {toFix > 0 && (
            <FilterLink href={withFilter(filters, { tab: "gigs" })} className="text-accent">
              {plural(toFix, "title")} {toFix === 1 ? "needs" : "need"} a look.
            </FilterLink>
          )}
        </p>
      )}
      <BarCard
        title="How far ahead gigs get booked"
        note={
          tiles.leadMissing
            ? `${plural(tiles.leadMissing, "gig")} with no booking date left out.`
            : undefined
        }
        rows={stats.leadHistogram.map((bar) => ({
          key: bar.key,
          label: bar.label,
          values: { jobs: bar.jobs, holds: bar.holds, wanted: bar.wanted },
        }))}
        series={countSeries}
        direction="up"
        format="count"
        labelHeader="Booked ahead"
        empty="None of these gigs has a booking date yet."
        labelAll
      />
      <BarCard
        title={stats.byPeriod[0]?.key.length === 4 ? "Gigs by year" : "Gigs by month"}
        rows={periodRows(stats.byPeriod)}
        series={countSeries}
        direction="up"
        format="count"
        labelHeader="Month"
        empty="No gigs in this view."
      />
    </>
  );

  const tabs = {
    overview,
    people: (
      <RankList
        rows={stats.people}
        field="person"
        filters={filters}
        empty="No gigs in this view."
      />
    ),
    places: (
      <RankList
        rows={stats.places}
        field="location"
        filters={filters}
        empty="No gigs in this view."
      />
    ),
    gigs: (
      <>
        <NeedsAttention attention={attention} names={calendarNames()} />
        <GigTable
          gigs={stats.gigs.map((gig) => ({
            uid: gig.uid,
            gigDate: gig.gigDate,
            title: gig.title,
            person: gig.person,
            location: gig.location,
            price: gig.price,
            leadDays: gig.leadDays,
            status: gig.status,
          }))}
        />
      </>
    ),
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pt-6 pb-28">
      {header}
      {notices}
      <PendingProvider>
        <FilterBar filters={filters} people={options.people} locations={options.locations} />
        <PendingFrame>
          {nothing && filters.tab !== "gigs" ? (
            <Card title="Nothing matches these filters">
              <p className="text-sm text-muted">
                Try a wider date range, or{" "}
                <FilterLink href={withFilter(DEFAULT_FILTERS, { tab: filters.tab })} className="text-accent">
                  clear the filters
                </FilterLink>
                .
              </p>
            </Card>
          ) : (
            tabs[filters.tab]
          )}
        </PendingFrame>
        <TabBar filters={filters} attention={toFix} />
      </PendingProvider>
    </main>
  );
}
