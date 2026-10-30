import { addDays, isDay, type Day } from "./dates";

export type RangeKey = "all" | "month" | "6m" | "year" | "12m" | "custom";
/** Which calendar a gig is in. "wanted" means he was asked but wasn't free. */
export type Status = "job" | "hold" | "wanted";
export type LeadKey = "lt1w" | "1to4w" | "1to3m" | "3m";
export type TabKey = "overview" | "gigs" | "stats" | "settings";
/** Gigs tab: which gigs by date. */
export type WhenKey = "upcoming" | "past" | "all";
/** Gigs tab: booked and on hold together, or one calendar. */
export type ShowKey = "gigs" | Status;
export type SortKey = "date" | "date-desc" | "lead" | "lead-desc" | "price-desc" | "price";
/** Settings tab: which list to manage. */
export type SectionKey = "people" | "places" | "rules" | "account";
/** Stats tab: the card that's open, if any. */
export type CardKey = "location" | "musician" | "busiest";
/** The busiest card: a month, half a year or a year at a time, or dates he picks. */
export type PerKey = "month" | "half" | "year" | "custom";
export type PeriodPer = Exclude<PerKey, "custom">;

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "6m", label: "Last 6 months" },
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "custom", label: "Custom dates" },
];

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "gigs", label: "Gigs" },
  { key: "stats", label: "Stats" },
  { key: "settings", label: "Settings" },
];

export const WHENS: { key: WhenKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Completed" },
  { key: "all", label: "All" },
];

export const SHOWS: { key: ShowKey; label: string }[] = [
  { key: "gigs", label: "Booked and on hold" },
  { key: "job", label: "Booked" },
  { key: "hold", label: "On hold" },
  { key: "wanted", label: "Asked, not free" },
];

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date: soonest first" },
  { key: "date-desc", label: "Date: latest first" },
  { key: "lead", label: "Lead time: shortest first" },
  { key: "lead-desc", label: "Lead time: longest first" },
  { key: "price-desc", label: "Price: highest first" },
  { key: "price", label: "Price: lowest first" },
];

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "people", label: "Musicians" },
  { key: "places", label: "Places" },
  { key: "rules", label: "Rules" },
  { key: "account", label: "Account" },
];

export const CARDS: { key: CardKey }[] = [{ key: "location" }, { key: "musician" }, { key: "busiest" }];

export const PERS: { key: PerKey; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "half", label: "6 months" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

/** Lead-time buckets, in days. `max` is inclusive; null means no upper limit. */
export const LEAD_BUCKETS: { key: LeadKey; label: string; min: number; max: number | null }[] = [
  { key: "lt1w", label: "Under 1 week", min: 0, max: 6 },
  { key: "1to4w", label: "1–4 weeks", min: 7, max: 29 },
  { key: "1to3m", label: "1–3 months", min: 30, max: 89 },
  { key: "3m", label: "3+ months", min: 90, max: null },
];

/** The person or location key for gigs that have none, e.g. no location in the title. */
export const NONE_KEY = "(none)";

export type Filters = {
  range: RangeKey;
  /** Only used when range is "custom". Either end can be open. */
  from: Day | null;
  to: Day | null;
  /** A personKey, or NONE_KEY. */
  person: string | null;
  /** A locationKey, or NONE_KEY. */
  location: string | null;
  lead: LeadKey | null;
  tab: TabKey;
  /** The next three only apply to the Gigs tab. */
  when: WhenKey;
  show: ShowKey;
  sort: SortKey;
  /** Only applies to the Settings tab. */
  section: SectionKey;
  /** The rest only apply to the Stats tab: the open card (person or location says whose). */
  card: CardKey | null;
  per: PerKey;
  /** The busiest card's period ("2026-11", "2026-H2" or "2026"). Null means the busiest one. */
  period: string | null;
};

export const DEFAULT_FILTERS: Filters = {
  range: "all",
  from: null,
  to: null,
  person: null,
  location: null,
  lead: null,
  tab: "overview",
  when: "upcoming",
  show: "gigs",
  sort: "date",
  section: "people",
  card: null,
  per: "month",
  period: null,
};

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

function oneOf<T extends string>(value: string | null, options: { key: T }[]): T | null {
  return options.find((option) => option.key === value)?.key ?? null;
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const HALF_KEY = /^\d{4}-H[12]$/;
const YEAR_KEY = /^\d{4}$/;

function periodOrNull(value: string | null): string | null {
  return value && (MONTH_KEY.test(value) || HALF_KEY.test(value) || YEAR_KEY.test(value)) ? value : null;
}

/** Reads the filters from the URL. Anything missing or invalid falls back to the default. */
export function parseFilters(params: SearchParams): Filters {
  const range = oneOf(first(params.range), RANGES) ?? DEFAULT_FILTERS.range;
  let from: Day | null = null;
  let to: Day | null = null;
  if (range === "custom") {
    const rawFrom = first(params.from);
    const rawTo = first(params.to);
    from = rawFrom && isDay(rawFrom) ? rawFrom : null;
    to = rawTo && isDay(rawTo) ? rawTo : null;
    if (from && to && from > to) [from, to] = [to, from];
  }
  return {
    range,
    from,
    to,
    person: first(params.person),
    location: first(params.location),
    lead: oneOf(first(params.lead), LEAD_BUCKETS),
    tab: oneOf(first(params.tab), TABS) ?? DEFAULT_FILTERS.tab,
    when: oneOf(first(params.when), WHENS) ?? DEFAULT_FILTERS.when,
    show: oneOf(first(params.show), SHOWS) ?? DEFAULT_FILTERS.show,
    sort: oneOf(first(params.sort), SORTS) ?? DEFAULT_FILTERS.sort,
    section: oneOf(first(params.section), SECTIONS) ?? DEFAULT_FILTERS.section,
    card: oneOf(first(params.card), CARDS),
    per: oneOf(first(params.per), PERS) ?? DEFAULT_FILTERS.per,
    period: periodOrNull(first(params.period)),
  };
}

/** The query string for these filters, leaving out defaults. Empty when everything is default. */
export function toQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_FILTERS.range) params.set("range", filters.range);
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (filters.person) params.set("person", filters.person);
  if (filters.location) params.set("location", filters.location);
  if (filters.lead) params.set("lead", filters.lead);
  for (const key of ["tab", "when", "show", "sort", "section"] as const) {
    if (filters[key] !== DEFAULT_FILTERS[key]) params.set(key, filters[key]);
  }
  if (filters.card) params.set("card", filters.card);
  if (filters.per !== DEFAULT_FILTERS.per) params.set("per", filters.per);
  if (filters.period) params.set("period", filters.period);
  return params.toString();
}

/** A link to the dashboard with one or more filters changed. */
export function withFilter(filters: Filters, change: Partial<Filters>): string {
  const query = toQuery({ ...filters, ...change });
  return query ? `/?${query}` : "/";
}

/** A link to a tab from scratch: only what `change` sets. */
export function linkTo(change: Partial<Filters>): string {
  return withFilter(DEFAULT_FILTERS, change);
}

/** The dates, person, place and lead time back to their defaults, keeping the tab's own choices. */
export function clearedFilters(filters: Filters): Filters {
  const { range, from, to, person, location, lead } = DEFAULT_FILTERS;
  return { ...filters, range, from, to, person, location, lead };
}

/** Whether the dates, person, place or lead time differ from the default. */
export function isFiltered(filters: Filters): boolean {
  return toQuery(filters) !== toQuery(clearedFilters(filters));
}

/** The last day of a "YYYY-MM" month. */
export function monthEnd(month: string): Day {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

/** The first and last gig dates in range, inclusive. Null means open-ended. */
export function dateBounds(filters: Filters, today: Day): { from: Day | null; to: Day | null } {
  switch (filters.range) {
    case "month": {
      const month = today.slice(0, 7);
      return { from: `${month}-01`, to: monthEnd(month) };
    }
    case "year": {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    case "6m":
      return { from: addDays(today, -182), to: today };
    case "12m":
      return { from: addDays(today, -364), to: today };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: filters.from, to: filters.to };
  }
}

/** The month ("2026-11"), half year ("2026-H2") or year ("2026") a day falls in. */
export function periodOf(day: Day, per: PeriodPer): string {
  if (per === "year") return day.slice(0, 4);
  if (per === "half") return `${day.slice(0, 4)}-H${Number(day.slice(5, 7)) <= 6 ? 1 : 2}`;
  return day.slice(0, 7);
}

/** Whether a period key is a month, a half year or a year. */
export function perOf(key: string): PeriodPer {
  return HALF_KEY.test(key) ? "half" : YEAR_KEY.test(key) ? "year" : "month";
}

/** The first and last day of a period. */
export function periodBounds(key: string): { from: Day; to: Day } {
  const year = key.slice(0, 4);
  switch (perOf(key)) {
    case "year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "half":
      return key.endsWith("1") ? { from: `${year}-01-01`, to: `${year}-06-30` } : { from: `${year}-07-01`, to: `${year}-12-31` };
    case "month":
      return { from: `${key}-01`, to: monthEnd(key) };
  }
}

const LONG_MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const asDate = (day: Day) => new Date(`${day}T00:00:00Z`);

/** "November 2026", "Jul–Dec 2026" or "2026". */
export function periodLabel(key: string): string {
  switch (perOf(key)) {
    case "year":
      return key;
    case "half":
      return `${key.endsWith("1") ? "Jan–Jun" : "Jul–Dec"} ${key.slice(0, 4)}`;
    case "month":
      return LONG_MONTH.format(asDate(`${key}-01`));
  }
}

/** "This year"; "March 2026" for custom dates that cover exactly that; otherwise the dates. */
export function rangeLabel(filters: Filters): string {
  const { from, to } = filters;
  if (filters.range !== "custom") return RANGES.find((range) => range.key === filters.range)!.label;
  if (from && to) {
    for (const per of ["month", "half", "year"] as const) {
      const bounds = periodBounds(periodOf(from, per));
      if (bounds.from === from && bounds.to === to) return periodLabel(periodOf(from, per));
    }
    return `${SHORT_DAY.format(asDate(from))} – ${SHORT_DAY.format(asDate(to))}`;
  }
  if (from) return `From ${SHORT_DAY.format(asDate(from))}`;
  if (to) return `Until ${SHORT_DAY.format(asDate(to))}`;
  return "All time";
}

/** Which bucket a lead time falls in. None for an unknown or negative lead time. */
export function leadBucket(days: number | null): LeadKey | null {
  if (days === null || days < 0) return null;
  return LEAD_BUCKETS.find((bucket) => days >= bucket.min && (bucket.max === null || days <= bucket.max))!.key;
}

type Filterable = {
  status: Status;
  personKey: string | null;
  locationKey: string | null;
  gigDate: Day;
  leadDays: number | null;
};

/** Whether a gig passes every filter. */
export function inScope(row: Filterable, filters: Filters, today: Day): boolean {
  const { from, to } = dateBounds(filters, today);
  if (from && row.gigDate < from) return false;
  if (to && row.gigDate > to) return false;
  if (filters.person && (row.personKey ?? NONE_KEY) !== filters.person) return false;
  if (filters.location && (row.locationKey ?? NONE_KEY) !== filters.location) return false;
  if (filters.lead && leadBucket(row.leadDays) !== filters.lead) return false;
  return true;
}
