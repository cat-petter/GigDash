import type { Day } from "./dates";
import {
  dateBounds,
  inScope,
  LEAD_BUCKETS,
  leadBucket,
  matchesShow,
  NONE_KEY,
  type Filters,
} from "./filters";

/** One gig, as the dashboard needs it. */
export type GigRow = {
  uid: string;
  title: string;
  status: "job" | "hold";
  titleKeyword: "job" | "hold" | null;
  person: string | null;
  personKey: string | null;
  price: number | null;
  location: string | null;
  locationKey: string | null;
  gigDate: Day;
  leadDays: number | null;
  heldAt: Date | null;
  confirmedAt: Date | null;
  parseError: string | null;
  recurring: boolean;
  deleted: boolean;
};

export const OTHER_KEY = "(other)";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How many people or places a chart shows before grouping the rest as "Other". */
export const TOP_N = 8;
/** Past this many months, "by month" becomes "by year". */
const MAX_MONTHS = 36;

export type MoneyBar = { key: string; label: string; dollars: number; jobs: number; others?: number };
export type CountBar = { key: string; label: string; jobs: number; holds: number; others?: number };
export type PeriodCount = { key: string; label: string; full: string; jobs: number; holds: number };
export type LeadBar = { key: string; label: string; jobs: number; holds: number };
export type PersonLead = { key: string; label: string; count: number; average: number; median: number };

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The first `limit` items, then the rest merged into one by `combine`.
 * Items should already be sorted. A lone leftover item is shown as itself rather than as "Other".
 */
export function topWithOther<T>(items: T[], limit: number, combine: (rest: T[]) => T): T[] {
  if (items.length <= limit + 1) return items;
  return [...items.slice(0, limit), combine(items.slice(limit))];
}

type Group = { key: string; label: string; rows: GigRow[] };

/**
 * Groups rows by key. A group's label is the spelling used most often,
 * with ties going to the spelling on the latest gig.
 */
function groupBy(rows: GigRow[], keyOf: (row: GigRow) => string, labelOf: (row: GigRow) => string): Group[] {
  const groups = new Map<string, { rows: GigRow[]; spellings: Map<string, { count: number; latest: Day }> }>();
  for (const row of rows) {
    const key = keyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = { rows: [], spellings: new Map() };
      groups.set(key, group);
    }
    group.rows.push(row);
    const label = labelOf(row);
    const spelling = group.spellings.get(label);
    if (!spelling) group.spellings.set(label, { count: 1, latest: row.gigDate });
    else {
      spelling.count += 1;
      if (row.gigDate > spelling.latest) spelling.latest = row.gigDate;
    }
  }
  return [...groups].map(([key, group]) => {
    let best = "";
    let bestSpelling = { count: 0, latest: "" };
    for (const [label, spelling] of group.spellings) {
      if (
        spelling.count > bestSpelling.count ||
        (spelling.count === bestSpelling.count && spelling.latest > bestSpelling.latest)
      ) {
        best = label;
        bestSpelling = spelling;
      }
    }
    return { key, label: best, rows: group.rows };
  });
}

const personKeyOf = (row: GigRow) => row.personKey ?? NONE_KEY;
const personLabelOf = (row: GigRow) => row.person ?? "No name";
const locationKeyOf = (row: GigRow) => row.locationKey ?? NONE_KEY;
const locationLabelOf = (row: GigRow) => row.location ?? "No location";

export const byPerson = (rows: GigRow[]) => groupBy(rows, personKeyOf, personLabelOf);
export const byLocation = (rows: GigRow[]) => groupBy(rows, locationKeyOf, locationLabelOf);

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, "en", { sensitivity: "base" });

function moneyBars(groups: Group[]): MoneyBar[] {
  const bars = groups
    .map((group) => {
      const priced = group.rows.filter((row) => row.price !== null);
      return {
        key: group.key,
        label: group.label,
        dollars: priced.reduce((sum, row) => sum + row.price!, 0),
        jobs: priced.length,
      };
    })
    .filter((bar) => bar.jobs > 0)
    .sort((a, b) => b.dollars - a.dollars || byLabel(a, b));
  return topWithOther(bars, TOP_N, (rest) => ({
    key: OTHER_KEY,
    label: "Other",
    dollars: rest.reduce((sum, bar) => sum + bar.dollars, 0),
    jobs: rest.reduce((sum, bar) => sum + bar.jobs, 0),
    others: rest.length,
  }));
}

function countBars(groups: Group[]): CountBar[] {
  const bars = groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      jobs: group.rows.filter((row) => row.status === "job").length,
      holds: group.rows.filter((row) => row.status === "hold").length,
    }))
    .sort((a, b) => b.jobs + b.holds - (a.jobs + a.holds) || b.jobs - a.jobs || byLabel(a, b));
  return topWithOther(bars, TOP_N, (rest) => ({
    key: OTHER_KEY,
    label: "Other",
    jobs: rest.reduce((sum, bar) => sum + bar.jobs, 0),
    holds: rest.reduce((sum, bar) => sum + bar.holds, 0),
    others: rest.length,
  }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Jobs and holds per month across the range, including empty months. Per year if that's too many months. */
export function countsByPeriod(rows: GigRow[], bounds: { from: Day | null; to: Day | null }): PeriodCount[] {
  if (rows.length === 0) return [];
  const dates = rows.map((row) => row.gigDate).sort();
  const start = bounds.from ?? dates[0];
  const end = bounds.to ?? dates[dates.length - 1];
  if (end < start) return [];

  const [startYear, startMonth] = [Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1];
  const [endYear, endMonth] = [Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1];
  const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  const yearly = months > MAX_MONTHS;
  const oneYear = startYear === endYear;

  const periods: PeriodCount[] = [];
  if (yearly) {
    for (let year = startYear; year <= endYear; year++) {
      periods.push({ key: String(year), label: String(year), full: String(year), jobs: 0, holds: 0 });
    }
  } else {
    for (let i = 0; i < months; i++) {
      const year = startYear + Math.floor((startMonth + i) / 12);
      const month = (startMonth + i) % 12;
      periods.push({
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        label: oneYear ? MONTHS[month] : `${MONTHS[month]} ’${String(year).slice(2)}`,
        full: `${LONG_MONTHS[month]} ${year}`,
        jobs: 0,
        holds: 0,
      });
    }
  }

  const index = new Map(periods.map((period, i) => [period.key, i]));
  for (const row of rows) {
    const period = periods[index.get(yearly ? row.gigDate.slice(0, 4) : row.gigDate.slice(0, 7)) ?? -1];
    if (!period) continue;
    if (row.status === "job") period.jobs += 1;
    else period.holds += 1;
  }
  return periods;
}

function hasLead(row: GigRow): row is GigRow & { leadDays: number } {
  return row.leadDays !== null && row.leadDays >= 0;
}

function sum(rows: GigRow[]): number {
  return rows.reduce((total, row) => total + (row.price ?? 0), 0);
}

export function computeStats(rows: GigRow[], filters: Filters, today: Day) {
  const bounds = dateBounds(filters, today);
  const live = rows.filter((row) => !row.deleted);
  // Tiles cover both jobs and holds, so they ignore the jobs/holds filter.
  const scoped = live.filter((row) => inScope(row, filters, today));
  const shown = scoped.filter((row) => matchesShow(row, filters.show));

  const jobs = scoped.filter((row) => row.status === "job");
  const pastJobs = jobs.filter((row) => row.gigDate < today);
  const upcomingJobs = jobs.filter((row) => row.gigDate >= today);
  const holds = scoped.filter((row) => row.status === "hold");

  // A hold falls through when it's deleted, or when its date passes while it's still a hold.
  const converted = jobs.filter((row) => row.confirmedAt !== null);
  const fellThrough =
    rows.filter((row) => row.deleted && row.status === "hold" && inScope(row, filters, today)).length +
    holds.filter((row) => row.gigDate < today).length;
  const decided = converted.length + fellThrough;
  const daysToConfirm = converted
    .filter((row) => row.heldAt && row.confirmedAt)
    .map((row) => Math.max(0, Math.floor((row.confirmedAt!.getTime() - row.heldAt!.getTime()) / MS_PER_DAY)));

  const withLead = shown.filter(hasLead);
  const leads = withLead.map((row) => row.leadDays);

  const shownJobs = shown.filter((row) => row.status === "job");

  return {
    bounds,
    tiles: {
      jobs: jobs.length,
      pastJobs: pastJobs.length,
      upcomingJobs: upcomingJobs.length,
      earned: sum(pastJobs),
      upcoming: sum(upcomingJobs),
      /** Jobs in range with no price, which the money totals can't include. */
      unpriced: jobs.filter((row) => row.price === null).length,
      openHolds: holds.filter((row) => row.gigDate >= today).length,
      converted: converted.length,
      fellThrough,
      /** Of the holds that have been decided, the share that became jobs. Null before any are decided. */
      holdRate: decided ? converted.length / decided : null,
      medianDaysToConfirm: median(daysToConfirm),
      leadMedian: median(leads),
      leadAverage: average(leads),
      leadCounted: leads.length,
      /** Shown gigs without a usable lead time (unknown booking date, or entered after the gig). */
      leadMissing: shown.length - leads.length,
    },
    leadHistogram: LEAD_BUCKETS.map(
      (bucket): LeadBar => ({
        key: bucket.key,
        label: bucket.label,
        jobs: withLead.filter((row) => row.status === "job" && leadBucket(row.leadDays) === bucket.key).length,
        holds: withLead.filter((row) => row.status === "hold" && leadBucket(row.leadDays) === bucket.key).length,
      }),
    ),
    leadByPerson: byPerson(withLead)
      .map(
        (group): PersonLead => ({
          key: group.key,
          label: group.label,
          count: group.rows.length,
          average: average(group.rows.map((row) => row.leadDays!))!,
          median: median(group.rows.map((row) => row.leadDays!))!,
        }),
      )
      .sort((a, b) => b.count - a.count || byLabel(a, b)),
    money: {
      byPerson: moneyBars(byPerson(shownJobs)),
      byLocation: moneyBars(byLocation(shownJobs)),
      total: sum(shownJobs),
      /** Shown jobs with no price. */
      unpriced: shownJobs.filter((row) => row.price === null).length,
    },
    counts: {
      byPeriod: countsByPeriod(shown, bounds),
      byPerson: countBars(byPerson(shown)),
      byLocation: countBars(byLocation(shown)),
    },
    /** The gig list, latest first. */
    gigs: [...shown].sort((a, b) => b.gigDate.localeCompare(a.gigDate)),
  };
}

export type Stats = ReturnType<typeof computeStats>;

export type FilterOption = { key: string; label: string; count: number };

/** The people and places to offer in the filters: everyone in the calendar, alphabetically. */
export function filterOptions(rows: GigRow[]): { people: FilterOption[]; locations: FilterOption[] } {
  const live = rows.filter((row) => !row.deleted);
  const options = (groups: Group[]) =>
    groups
      .map((group) => ({ key: group.key, label: group.label, count: group.rows.length }))
      .sort((a, b) => Number(a.key === NONE_KEY) - Number(b.key === NONE_KEY) || byLabel(a, b));
  return { people: options(byPerson(live)), locations: options(byLocation(live)) };
}

export type Attention = {
  unreadable: GigRow[];
  unpriced: GigRow[];
  mismatched: GigRow[];
  recurring: GigRow[];
};

/** Events to fix in the calendar. Ignores the filters, so nothing hides here. */
export function needsAttention(rows: GigRow[]): Attention {
  const live = rows
    .filter((row) => !row.deleted)
    .sort((a, b) => b.gigDate.localeCompare(a.gigDate));
  return {
    unreadable: live.filter((row) => row.parseError !== null),
    unpriced: live.filter((row) => row.status === "job" && row.parseError === null && row.price === null),
    mismatched: live.filter((row) => row.titleKeyword !== null && row.titleKeyword !== row.status),
    recurring: live.filter((row) => row.recurring),
  };
}
