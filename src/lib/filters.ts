import { addDays, isDay, type Day } from "./dates";

export type RangeKey = "year" | "12m" | "all" | "custom";
/** Which calendar a gig is in. "wanted" means he was asked but wasn't free. */
export type Status = "job" | "hold" | "wanted";
export type LeadKey = "lt1w" | "1to4w" | "1to3m" | "3m";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates" },
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
};

export const DEFAULT_FILTERS: Filters = {
  range: "year",
  from: null,
  to: null,
  person: null,
  location: null,
  lead: null,
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
  return params.toString();
}

/** A link to the dashboard with one or more filters changed. */
export function withFilter(filters: Filters, change: Partial<Filters>): string {
  const query = toQuery({ ...filters, ...change });
  return query ? `/?${query}` : "/";
}

/** Whether any filter differs from the default. */
export function isFiltered(filters: Filters): boolean {
  return toQuery(filters) !== "";
}

/** How many filters besides the date range are set. */
export function extraFilterCount(filters: Filters): number {
  return [filters.person, filters.location, filters.lead].filter(Boolean).length;
}

/** The first and last gig dates in range, inclusive. Null means open-ended. */
export function dateBounds(filters: Filters, today: Day): { from: Day | null; to: Day | null } {
  switch (filters.range) {
    case "year": {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    case "12m":
      return { from: addDays(today, -364), to: today };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: filters.from, to: filters.to };
  }
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
