import type { Day } from "./dates";
import {
  dateBounds,
  inScope,
  LEAD_BUCKETS,
  leadBucket,
  NONE_KEY,
  type Filters,
  type SortKey,
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

export type PeriodCount = { key: string; label: string; full: string; jobs: number };
export type LeadBar = { key: string; label: string; jobs: number };

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Jobs per month across the range, including empty months. Per year if that's too many months. */
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
      periods.push({ key: String(year), label: String(year), full: String(year), jobs: 0 });
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
      });
    }
  }

  const index = new Map(periods.map((period, i) => [period.key, i]));
  for (const row of rows) {
    const period = periods[index.get(yearly ? row.gigDate.slice(0, 4) : row.gigDate.slice(0, 7)) ?? -1];
    if (!period) continue;
    if (row.status === "job") period.jobs += 1;
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
  const inRange = live.filter((row) => inScope(row, filters, today));
  const wanted = inRange.filter((row) => row.status === "wanted");

  const jobs = inRange.filter((row) => row.status === "job");
  const pastJobs = jobs.filter((row) => row.gigDate < today);
  const upcomingJobs = jobs.filter((row) => row.gigDate >= today);
  const holds = inRange.filter((row) => row.status === "hold");

  // A hold falls through when it's deleted, or when its date passes while it's still a hold.
  const converted = jobs.filter((row) => row.confirmedAt !== null);
  const fellThrough =
    rows.filter((row) => row.deleted && row.status === "hold" && inScope(row, filters, today)).length +
    holds.filter((row) => row.gigDate < today).length;
  const decided = converted.length + fellThrough;
  const daysToConfirm = converted
    .filter((row) => row.heldAt && row.confirmedAt)
    .map((row) => Math.max(0, Math.floor((row.confirmedAt!.getTime() - row.heldAt!.getTime()) / MS_PER_DAY)));

  // Lead times and the charts count booked jobs only.
  const withLead = jobs.filter(hasLead);
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
      leadShortest: leads.length ? Math.min(...leads) : null,
      leadLongest: leads.length ? Math.max(...leads) : null,
      leadCounted: leads.length,
      /** Jobs without a usable lead time (unknown booking date, or entered after the gig). */
      leadMissing: jobs.length - leads.length,
      /** Dates he was asked for but wasn't free. */
      wanted: wanted.length,
    },
    leadHistogram: LEAD_BUCKETS.map(
      (bucket): LeadBar => ({
        key: bucket.key,
        label: bucket.label,
        jobs: withLead.filter((row) => leadBucket(row.leadDays) === bucket.key).length,
      }),
    ),
    byPeriod: countsByPeriod(jobs, bounds),
  };
}

export type Stats = ReturnType<typeof computeStats>;

/** Everything about one person who hires him, for the card at the top of their Overview. */
export type Profile = {
  label: string;
  jobs: number;
  played: number;
  upcomingJobs: number;
  /** Median price of their priced jobs, or null when none has a price. */
  typicalPrice: number | null;
  averagePrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  priced: number;
  earned: number;
  upcoming: number;
  leadMedian: number | null;
  leadShortest: number | null;
  leadLongest: number | null;
  lastGig: Day | null;
  nextGig: Day | null;
  openHolds: number;
  holdRate: number | null;
  wanted: number;
  /** Where they book him most, by jobs. */
  topPlaces: { label: string; jobs: number }[];
};

/**
 * One person's numbers in the chosen dates (and place, if one is picked).
 * Ignores the lead-time filter so the card always shows the whole picture.
 */
export function personProfile(rows: GigRow[], filters: Filters, today: Day): Profile | null {
  if (!filters.person) return null;
  const all = computeStats(rows, { ...filters, lead: null }, today);
  const mine = rows.filter(
    (row) => !row.deleted && inScope(row, { ...filters, lead: null }, today),
  );
  const jobs = mine.filter((row) => row.status === "job");
  const prices = jobs.flatMap((row) => (row.price === null ? [] : [row.price]));
  const past = jobs.filter((row) => row.gigDate < today).map((row) => row.gigDate).sort();
  const future = jobs.filter((row) => row.gigDate >= today).map((row) => row.gigDate).sort();
  const label = byPerson(mine)[0]?.label ?? filters.person;
  return {
    label,
    jobs: jobs.length,
    played: past.length,
    upcomingJobs: future.length,
    typicalPrice: median(prices),
    averagePrice: average(prices),
    lowPrice: prices.length ? Math.min(...prices) : null,
    highPrice: prices.length ? Math.max(...prices) : null,
    priced: prices.length,
    earned: all.tiles.earned,
    upcoming: all.tiles.upcoming,
    leadMedian: all.tiles.leadMedian,
    leadShortest: all.tiles.leadShortest,
    leadLongest: all.tiles.leadLongest,
    lastGig: past.at(-1) ?? null,
    nextGig: future[0] ?? null,
    openHolds: all.tiles.openHolds,
    holdRate: all.tiles.holdRate,
    wanted: all.tiles.wanted,
    topPlaces: byLocation(jobs)
      .filter((place) => place.key !== NONE_KEY)
      .map((place) => ({ label: place.label, jobs: place.rows.length }))
      .sort((a, b) => b.jobs - a.jobs || byLabel(a, b))
      .slice(0, 3),
  };
}

/** Missing values sort last, whichever way the list is sorted. */
function compareMissingLast(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return (a - b) * direction;
}

const SORTERS: Record<SortKey, (a: GigRow, b: GigRow) => number> = {
  date: () => 0,
  "date-desc": (a, b) => b.gigDate.localeCompare(a.gigDate),
  lead: (a, b) => compareMissingLast(a.leadDays, b.leadDays, 1),
  "lead-desc": (a, b) => compareMissingLast(a.leadDays, b.leadDays, -1),
  price: (a, b) => compareMissingLast(a.price, b.price, 1),
  "price-desc": (a, b) => compareMissingLast(a.price, b.price, -1),
};

/** The gigs for the Gigs tab: the shared filters, then upcoming or completed, which calendar, and the sort. */
export function gigList(rows: GigRow[], filters: Filters, today: Day): GigRow[] {
  return rows
    .filter((row) => {
      if (row.deleted || !inScope(row, filters, today)) return false;
      if (filters.when === "upcoming" && row.gigDate < today) return false;
      if (filters.when === "past" && row.gigDate >= today) return false;
      return filters.show === "gigs" ? row.status !== "wanted" : row.status === filters.show;
    })
    .sort(
      (a, b) =>
        SORTERS[filters.sort](a, b) ||
        a.gigDate.localeCompare(b.gigDate) ||
        (a.person ?? a.title).localeCompare(b.person ?? b.title, "en", { sensitivity: "base" }),
    );
}

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
