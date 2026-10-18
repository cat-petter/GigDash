import type { Day } from "./dates";
import {
  dateBounds,
  inScope,
  LEAD_BUCKETS,
  leadBucket,
  matchesShow,
  NONE_KEY,
  type Filters,
  type Status,
} from "./filters";

/** One gig, as the dashboard needs it. */
export type GigRow = {
  uid: string;
  title: string;
  status: Status;
  titleKeyword: Status | null;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Past this many months, "by month" becomes "by year". */
const MAX_MONTHS = 36;

export type PeriodCount = { key: string; label: string; full: string; jobs: number; holds: number; wanted: number };
export type LeadBar = { key: string; label: string; jobs: number; holds: number; wanted: number };
/** One person or place on the People and Places tabs. */
export type Ranked = {
  key: string;
  label: string;
  jobs: number;
  holds: number;
  /** Times he was asked but wasn't free. */
  wanted: number;
  /** From priced jobs only. */
  dollars: number;
  unpriced: number;
  /** Median days booked ahead, or null when none of their gigs has a booking date. */
  leadMedian: number | null;
};

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

/** Everyone (or everywhere) in view, most gigs first. No "Other": the list scrolls instead. */
function ranked(groups: Group[]): Ranked[] {
  return groups
    .map((group) => {
      const jobs = group.rows.filter((row) => row.status === "job");
      return {
        key: group.key,
        label: group.label,
        jobs: jobs.length,
        holds: group.rows.filter((row) => row.status === "hold").length,
        wanted: group.rows.filter((row) => row.status === "wanted").length,
        dollars: sum(jobs),
        unpriced: jobs.filter((row) => row.price === null).length,
        leadMedian: median(group.rows.filter(hasLead).map((row) => row.leadDays)),
      };
    })
    .sort(
      (a, b) => b.jobs + b.holds + b.wanted - (a.jobs + a.holds + a.wanted) || b.jobs - a.jobs || byLabel(a, b),
    );
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
      periods.push({ key: String(year), label: String(year), full: String(year), jobs: 0, holds: 0, wanted: 0 });
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
        wanted: 0,
      });
    }
  }

  const index = new Map(periods.map((period, i) => [period.key, i]));
  for (const row of rows) {
    const period = periods[index.get(yearly ? row.gigDate.slice(0, 4) : row.gigDate.slice(0, 7)) ?? -1];
    if (!period) continue;
    if (row.status === "job") period.jobs += 1;
    else if (row.status === "hold") period.holds += 1;
    else period.wanted += 1;
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
  const inRange = live.filter((row) => inScope(row, filters, today));
  const scoped = inRange.filter((row) => row.status !== "wanted");
  const wanted = inRange.filter((row) => row.status === "wanted");
  const shown = inRange.filter((row) => matchesShow(row, filters.show));

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
      /** Dates he was asked for but wasn't free. */
      wanted: wanted.length,
    },
    leadHistogram: LEAD_BUCKETS.map(
      (bucket): LeadBar => ({
        key: bucket.key,
        label: bucket.label,
        jobs: withLead.filter((row) => row.status === "job" && leadBucket(row.leadDays) === bucket.key).length,
        holds: withLead.filter((row) => row.status === "hold" && leadBucket(row.leadDays) === bucket.key).length,
        wanted: withLead.filter((row) => row.status === "wanted" && leadBucket(row.leadDays) === bucket.key).length,
      }),
    ),
    byPeriod: countsByPeriod(shown, bounds),
    // Wanted dates count toward who asks most, unless the view is only jobs or only holds.
    people: ranked(byPerson(filters.show === "all" ? inRange : shown)),
    places: ranked(byLocation(filters.show === "all" ? inRange : shown)),
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
