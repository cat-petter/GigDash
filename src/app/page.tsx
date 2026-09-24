import Link from "next/link";
import { connection } from "next/server";
import { type BarRow, BarCard, type Series } from "@/components/BarCard";
import { Card } from "@/components/Card";
import { FilterBar } from "@/components/FilterBar";
import { GigTable } from "@/components/GigTable";
import { NeedsAttention } from "@/components/NeedsAttention";
import { FilterLink, PendingFrame, PendingProvider } from "@/components/Pending";
import { PersonLeadTable } from "@/components/PersonLeadTable";
import { StatTile } from "@/components/StatTile";
import { SyncButton } from "@/components/SyncButton";
import { calendarNames, icloudConfigured } from "@/lib/caldav";
import { addDays, appTimeZone, dayInZone } from "@/lib/dates";
import { type Filters, type LeadKey, parseFilters, withFilter } from "@/lib/filters";
import { formatMoney, plural } from "@/lib/format";
import { loadGigRows } from "@/lib/gigs";
import { autoSync, syncStatus } from "@/lib/run-sync";
import {
  computeStats,
  type CountBar,
  filterOptions,
  type MoneyBar,
  needsAttention,
  OTHER_KEY,
  type PeriodCount,
} from "@/lib/stats";

const JOBS: Series = { key: "jobs", one: "job", many: "jobs", color: "var(--series-1)" };
const HOLDS: Series = { key: "holds", one: "hold", many: "holds", color: "var(--series-2)" };
// Money only ever comes from jobs, so it wears the jobs color.
const MONEY: Series = { key: "dollars", one: "dollar", many: "dollars", color: "var(--series-1)" };

function labelOf(bar: { label: string; others?: number }): string {
  return bar.others ? `${bar.others} others` : bar.label;
}

function moneyRows(bars: MoneyBar[], link: (key: string) => string): BarRow[] {
  return bars.map((bar) => ({
    key: bar.key,
    label: labelOf(bar),
    note: `from ${plural(bar.jobs, "priced job")}`,
    href: bar.key === OTHER_KEY ? undefined : link(bar.key),
    values: { dollars: bar.dollars },
  }));
}

function countRows(bars: CountBar[], link: (key: string) => string): BarRow[] {
  return bars.map((bar) => ({
    key: bar.key,
    label: labelOf(bar),
    href: bar.key === OTHER_KEY ? undefined : link(bar.key),
    values: { jobs: bar.jobs, holds: bar.holds },
  }));
}

/** Tapping a month (or year) narrows the dates to it. */
function periodRows(periods: PeriodCount[], filters: Filters): BarRow[] {
  return periods.map((period) => {
    let from: string;
    let to: string;
    if (period.key.length === 4) {
      from = `${period.key}-01-01`;
      to = `${period.key}-12-31`;
    } else {
      from = `${period.key}-01`;
      const [year, month] = period.key.split("-").map(Number);
      to = addDays(`${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, "0")}-01`, -1);
    }
    return {
      key: period.key,
      label: period.label,
      full: period.full,
      href: withFilter(filters, { range: "custom", from, to }),
      values: { jobs: period.jobs, holds: period.holds },
    };
  });
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">{children}</p>;
}

export default async function Dashboard({ searchParams }: PageProps<"/">) {
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
        <h1 className="text-2xl font-semibold">GigDash</h1>
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
          APP_TIMEZONE isn&apos;t a time zone GigDash knows, so dates are counted in New York time.{" "}
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
            Once GigDash reads your calendars, your gigs show up here. Tap Sync now, or open{" "}
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

  const countSeries = filters.show === "job" ? [JOBS] : filters.show === "hold" ? [HOLDS] : [JOBS, HOLDS];
  const toPerson = (key: string) => withFilter(filters, { person: key });
  const toLocation = (key: string) => withFilter(filters, { location: key });
  const moneyEmpty =
    filters.show === "hold" ? "Money comes from jobs, and this view shows only holds." : "No priced jobs in this view.";
  const moneyNote =
    stats.money.unpriced > 0
      ? `${formatMoney(stats.money.total)} in all. ${plural(stats.money.unpriced, "job")} with no price ${stats.money.unpriced === 1 ? "is" : "are"} left out.`
      : `${formatMoney(stats.money.total)} in all.`;
  const toFix = attention.unreadable.length + attention.mismatched.length + attention.recurring.length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
      {header}
      {notices}
      <PendingProvider>
        <FilterBar filters={filters} people={options.people} locations={options.locations} />
        <PendingFrame>
          {stats.gigs.length === 0 && tiles.jobs === 0 && tiles.openHolds === 0 ? (
            <Card title="Nothing matches these filters">
              <p className="text-sm text-muted">
                Try a wider date range, or{" "}
                <FilterLink href="/" className="text-accent">
                  clear the filters
                </FilterLink>
                .
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile
                  label="Jobs"
                  value={tiles.jobs.toLocaleString("en-US")}
                  sub={`${tiles.pastJobs} played · ${tiles.upcomingJobs} coming up`}
                />
                <StatTile label="Earned" value={formatMoney(tiles.earned)} sub="Jobs already played" />
                <StatTile label="Upcoming" value={formatMoney(tiles.upcoming)} sub="Jobs still to play" />
                <StatTile
                  label="Lead time"
                  value={tiles.leadMedian === null ? "—" : plural(Math.round(tiles.leadMedian), "day")}
                  sub={
                    tiles.leadAverage === null
                      ? "No booking dates yet"
                      : `Median · average ${plural(Math.round(tiles.leadAverage), "day")}`
                  }
                />
                <StatTile label="Open holds" value={tiles.openHolds.toLocaleString("en-US")} sub="Dates still on hold" />
                <StatTile
                  label="Holds → jobs"
                  value={tiles.holdRate === null ? "—" : `${Math.round(tiles.holdRate * 100)}%`}
                  sub={
                    tiles.holdRate === null
                      ? "No holds decided yet"
                      : `${tiles.converted} of ${tiles.converted + tiles.fellThrough} decided${
                          tiles.medianDaysToConfirm === null
                            ? ""
                            : ` · confirmed in ${plural(Math.round(tiles.medianDaysToConfirm), "day")}`
                        }`
                  }
                />
              </div>
              {(tiles.unpriced > 0 || toFix > 0) && (
                <p className="text-xs text-muted">
                  {tiles.unpriced > 0 &&
                    `Earned and Upcoming leave out ${plural(tiles.unpriced, "job")} with no price in the title. `}
                  {toFix > 0 && (
                    <a href="#attention" className="text-accent">
                      {plural(toFix, "event")} {toFix === 1 ? "needs" : "need"} a look.
                    </a>
                  )}
                </p>
              )}

              <BarCard
                title="Lead time"
                note={`How far ahead gigs were booked. ${plural(tiles.leadCounted, "gig")}${
                  tiles.leadMissing ? `; ${tiles.leadMissing} with no booking date left out` : ""
                }.`}
                rows={stats.leadHistogram.map((bar) => ({
                  key: bar.key,
                  label: bar.label,
                  href: withFilter(filters, { lead: bar.key as LeadKey }),
                  values: { jobs: bar.jobs, holds: bar.holds },
                }))}
                series={countSeries}
                direction="up"
                format="count"
                labelHeader="Booked ahead"
                empty="None of these gigs has a booking date yet."
              />
              {stats.leadByPerson.length > 0 && (
                <Card title="Lead time by person" note="Days booked ahead. Tap a name to see only their gigs.">
                  <PersonLeadTable
                    rows={stats.leadByPerson.map((person) => ({ ...person, href: toPerson(person.key) }))}
                  />
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <BarCard
                  title="Money by person"
                  note={moneyNote}
                  rows={moneyRows(stats.money.byPerson, toPerson)}
                  series={[MONEY]}
                  direction="right"
                  format="money"
                  labelHeader="Person"
                  empty={moneyEmpty}
                />
                <BarCard
                  title="Money by location"
                  note={moneyNote}
                  rows={moneyRows(stats.money.byLocation, toLocation)}
                  series={[MONEY]}
                  direction="right"
                  format="money"
                  labelHeader="Location"
                  empty={moneyEmpty}
                />
              </div>

              <BarCard
                title={stats.counts.byPeriod[0]?.key.length === 4 ? "Gigs by year" : "Gigs by month"}
                note="By the date of the gig."
                rows={periodRows(stats.counts.byPeriod, filters)}
                series={countSeries}
                direction="up"
                format="count"
                labelHeader="Month"
                empty="No gigs in this view."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <BarCard
                  title="Gigs by person"
                  rows={countRows(stats.counts.byPerson, toPerson)}
                  series={countSeries}
                  direction="right"
                  format="count"
                  labelHeader="Person"
                  empty="No gigs in this view."
                />
                <BarCard
                  title="Gigs by location"
                  rows={countRows(stats.counts.byLocation, toLocation)}
                  series={countSeries}
                  direction="right"
                  format="count"
                  labelHeader="Location"
                  empty="No gigs in this view."
                />
              </div>

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
          )}
        </PendingFrame>
      </PendingProvider>
    </main>
  );
}
