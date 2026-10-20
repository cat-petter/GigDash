import Link from "next/link";
import { connection } from "next/server";
import { type BarRow, BarCard, type Series } from "@/components/BarCard";
import { Card } from "@/components/Card";
import { FilterBar } from "@/components/FilterBar";
import { GigsView } from "@/components/GigsView";
import { NeedsAttention } from "@/components/NeedsAttention";
import { FilterLink, PendingFrame, PendingProvider } from "@/components/Pending";
import { PersonProfile } from "@/components/PersonProfile";
import { StatTile } from "@/components/StatTile";
import { SyncButton } from "@/components/SyncButton";
import { TabBar } from "@/components/TabBar";
import { calendarNames, icloudConfigured } from "@/lib/caldav";
import { appTimeZone, dayInZone } from "@/lib/dates";
import { clearedFilters, type Filters, type LeadKey, monthEnd, parseFilters, withFilter } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import { loadGigRows } from "@/lib/gigs";
import { autoSync, syncStatus } from "@/lib/run-sync";
import { requireLogin } from "@/lib/session";
import {
  computeStats,
  filterOptions,
  gigList,
  needsAttention,
  type PeriodCount,
  personProfile,
} from "@/lib/stats";

const JOBS: Series = { key: "jobs", one: "job", many: "jobs", color: "var(--series-1)" };

/** Each month (or year) opens the Gigs tab on that month's jobs, soonest first. */
function periodRows(periods: PeriodCount[], filters: Filters): BarRow[] {
  return periods.map((period) => {
    const yearly = period.key.length === 4;
    return {
      key: period.key,
      label: period.label,
      full: period.full,
      values: { jobs: period.jobs },
      href: withFilter(filters, {
        tab: "gigs",
        range: "custom",
        from: yearly ? `${period.key}-01-01` : `${period.key}-01`,
        to: yearly ? `${period.key}-12-31` : monthEnd(period.key),
        when: "all",
        show: "job",
        sort: "date",
      }),
    };
  });
}

/** Each lead-time bar opens the Gigs tab on those jobs, shortest lead time first. */
function leadHref(filters: Filters, lead: LeadKey): string {
  return withFilter(filters, { tab: "gigs", lead, when: "all", show: "job", sort: "lead" });
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
  const profile = personProfile(rows, filters, today);

  const toFix = attention.unreadable.length + attention.mismatched.length + attention.recurring.length;
  const nothing = tiles.jobs === 0 && tiles.openHolds === 0 && tiles.wanted === 0;
  const onGigs = filters.tab === "gigs";

  const overview = (
    <>
      {profile && <PersonProfile profile={profile} />}
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
          label="Lead time"
          value={tiles.leadMedian === null ? "—" : plural(Math.round(tiles.leadMedian), "day")}
          sub={
            tiles.leadMedian === null
              ? "No booking dates yet"
              : `Typical · avg ${plural(Math.round(tiles.leadAverage ?? 0), "day")}`
          }
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
        <p className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span>Asked, but not free</span>
          <span className="font-semibold tabular-nums">{tiles.wanted.toLocaleString("en-US")}</span>
        </p>
      )}
      {(tiles.unpriced > 0 || toFix > 0) && (
        <p className="px-1 text-xs text-muted">
          {tiles.unpriced > 0 && `${plural(tiles.unpriced, "job")} with no price ${tiles.unpriced === 1 ? "isn't" : "aren't"} in Earned. `}
          {toFix > 0 && (
            <a href="#attention" className="text-accent">
              {plural(toFix, "title")} {toFix === 1 ? "needs" : "need"} a look.
            </a>
          )}
        </p>
      )}
      {tiles.leadCounted > 0 && (
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-line bg-surface p-3 text-center">
          {[
            ["Shortest", tiles.leadShortest],
            ["Typical", tiles.leadMedian],
            ["Average", tiles.leadAverage],
            ["Longest", tiles.leadLongest],
          ].map(([label, days]) => (
            <div key={label as string}>
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-0.5 font-semibold tabular-nums">{days === null ? "—" : `${Math.round(days as number)}d`}</p>
            </div>
          ))}
        </div>
      )}
      <BarCard
        title="Lead time"
        note={[
          "How far ahead each job was booked. Tap a bar to see those gigs.",
          tiles.leadMissing ? `${plural(tiles.leadMissing, "job")} with no booking date left out.` : "",
        ].join(" ")}
        rows={stats.leadHistogram.map((bar) => ({
          key: bar.key,
          label: bar.label,
          values: { jobs: bar.jobs },
          href: leadHref(filters, bar.key as LeadKey),
        }))}
        series={[JOBS]}
        direction="up"
        format="count"
        labelHeader="Lead time"
        empty="None of these jobs has a booking date yet."
        labelAll
      />
      <BarCard
        title={stats.byPeriod[0]?.key.length === 4 ? "Jobs by year" : "Jobs by month"}
        note="Tap a bar to see its gigs."
        rows={periodRows(stats.byPeriod, filters)}
        series={[JOBS]}
        direction="up"
        format="count"
        labelHeader="Month"
        empty="No jobs in this view."
      />
      {toFix > 0 && <NeedsAttention attention={attention} names={calendarNames()} />}
    </>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pt-6 pb-28">
      {header}
      {notices}
      <PendingProvider>
        <FilterBar filters={filters} people={options.people} locations={options.locations} />
        <PendingFrame>
          {onGigs ? (
            <GigsView gigs={gigList(rows, filters, today)} filters={filters} today={today} timeZone={timeZone} />
          ) : nothing ? (
            <Card title="Nothing matches these filters">
              <p className="text-sm text-muted">
                Try a wider date range, or{" "}
                <FilterLink href={withFilter(clearedFilters(filters), {})} className="text-accent">
                  clear the filters
                </FilterLink>
                .
              </p>
            </Card>
          ) : (
            overview
          )}
        </PendingFrame>
        <TabBar filters={filters} />
      </PendingProvider>
    </main>
  );
}
