import type { Day } from "./dates";
import {
  inScope,
  NONE_KEY,
  type Filters,
  periodLabel,
  periodOf,
  type PeriodPer,
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

/** One bar of the Overview chart: a month ("2026-11") or a year ("2026"). */
export type TimeBar = { key: string; label: string; full: string; jobs: number };

function nextPeriod(key: string): string {
  if (key.length === 4) return String(Number(key) + 1);
  const [year, month] = key.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Jobs per month (or year) with no gaps, from the first job (or `start`) through the
 * last one or this month, whichever is later.
 */
export function jobsOverTime(rows: GigRow[], per: "month" | "year", today: Day, start?: string): TimeBar[] {
  const keys = rows
    .filter((row) => !row.deleted && row.status === "job")
    .map((row) => periodOf(row.gigDate, per))
    .sort();
  const now = periodOf(today, per);
  const first = start ?? keys[0] ?? now;
  const last = (keys.at(-1) ?? now) > now ? keys.at(-1)! : now;
  const bars: TimeBar[] = [];
  for (let key = first; key <= last; key = nextPeriod(key)) {
    const label = per === "year" ? key : MONTHS[Number(key.slice(5, 7)) - 1];
    bars.push({ key, label, full: periodLabel(key), jobs: 0 });
  }
  const index = new Map(bars.map((bar, i) => [bar.key, i]));
  for (const key of keys) {
    const bar = bars[index.get(key) ?? -1];
    if (bar) bar.jobs += 1;
  }
  return bars;
}

function hasLead(row: GigRow): row is GigRow & { leadDays: number } {
  return row.leadDays !== null && row.leadDays >= 0;
}

function sum(rows: GigRow[]): number {
  return rows.reduce((total, row) => total + (row.price ?? 0), 0);
}

export function computeStats(rows: GigRow[], filters: Filters, today: Day) {
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

  // Lead times count booked jobs only.
  const leads = jobs.filter(hasLead).map((row) => row.leadDays);

  return {
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
  };
}

export type Stats = ReturnType<typeof computeStats>;
export type Lead = Pick<Stats["tiles"], "leadShortest" | "leadMedian" | "leadAverage" | "leadLongest">;

/** A musician, place or period, with its jobs and what they paid. */
export type Top = { key: string; label: string; jobs: number; money: number };

const mostJobs = (a: Top, b: Top) => b.jobs - a.jobs || b.money - a.money || byLabel(a, b);
const mostMoney = (a: Top, b: Top) => b.money - a.money || b.jobs - a.jobs || byLabel(a, b);

/** Most jobs first, then most money, leaving out jobs with no name (or no place). */
function ranked(groups: Group[]): Top[] {
  return groups
    .filter((group) => group.key !== NONE_KEY)
    .map((group) => ({ key: group.key, label: group.label, jobs: group.rows.length, money: sum(group.rows) }))
    .sort(mostJobs);
}

const liveJobs = (rows: GigRow[]) => rows.filter((row) => !row.deleted && row.status === "job");

/** Who books him, most jobs first. */
export const rankPeople = (rows: GigRow[]) => ranked(byPerson(liveJobs(rows)));
/** Where he plays, most jobs first. */
export const rankPlaces = (rows: GigRow[]) => ranked(byLocation(liveJobs(rows)));

/** Months (or half years, or years) with jobs, busiest first: most jobs, then most money, then the latest. */
export function rankPeriods(rows: GigRow[], per: PeriodPer): Top[] {
  const periods = new Map<string, Top>();
  for (const row of liveJobs(rows)) {
    const key = periodOf(row.gigDate, per);
    const period = periods.get(key) ?? { key, label: periodLabel(key), jobs: 0, money: 0 };
    period.jobs += 1;
    period.money += row.price ?? 0;
    periods.set(key, period);
  }
  return [...periods.values()].sort((a, b) => b.jobs - a.jobs || b.money - a.money || b.key.localeCompare(a.key));
}

/** The Stats tab's four headlines, over every gig. */
export function leaders(rows: GigRow[]) {
  const people = rankPeople(rows);
  return {
    place: rankPlaces(rows)[0] ?? null,
    hiredMost: people[0] ?? null,
    paidMost: [...people].sort(mostMoney).find((person) => person.money > 0) ?? null,
    busiestMonth: rankPeriods(rows, "month")[0] ?? null,
  };
}

/** The next booked job, today included. */
export function nextJob(rows: GigRow[], today: Day): GigRow | null {
  return (
    liveJobs(rows)
      .filter((row) => row.gigDate >= today)
      .sort((a, b) => a.gigDate.localeCompare(b.gigDate))[0] ?? null
  );
}

/** Everything about one musician, place or stretch of time: the numbers on a Stats card. */
export type Profile = Lead & {
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
  lastGig: Day | null;
  nextGig: Day | null;
  openHolds: number;
  holdRate: number | null;
  wanted: number;
  /** Who books him most here, and where he plays most for them. */
  topPeople: Top[];
  topPlaces: Top[];
  busiestMonth: Top | null;
};

/**
 * The numbers for the gigs that pass the filters (dates, and a musician or place).
 * Ignores the lead-time filter so the card always shows the whole picture.
 */
export function profile(rows: GigRow[], filters: Filters, today: Day): Profile {
  const scope = { ...filters, lead: null };
  const all = computeStats(rows, scope, today);
  const mine = rows.filter((row) => !row.deleted && inScope(row, scope, today));
  const jobs = mine.filter((row) => row.status === "job");
  const prices = jobs.flatMap((row) => (row.price === null ? [] : [row.price]));
  const past = jobs.filter((row) => row.gigDate < today).map((row) => row.gigDate).sort();
  const future = jobs.filter((row) => row.gigDate >= today).map((row) => row.gigDate).sort();
  return {
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
    leadShortest: all.tiles.leadShortest,
    leadMedian: all.tiles.leadMedian,
    leadAverage: all.tiles.leadAverage,
    leadLongest: all.tiles.leadLongest,
    lastGig: past.at(-1) ?? null,
    nextGig: future[0] ?? null,
    openHolds: all.tiles.openHolds,
    holdRate: all.tiles.holdRate,
    wanted: all.tiles.wanted,
    topPeople: rankPeople(jobs).slice(0, 3),
    topPlaces: rankPlaces(jobs).slice(0, 3),
    busiestMonth: rankPeriods(jobs, "month")[0] ?? null,
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
