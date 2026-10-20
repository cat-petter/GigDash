/** A calendar day as "YYYY-MM-DD", with no time zone attached. */
export type Day = string;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** APP_TIMEZONE, the zone lead times and "today" are counted in. */
export function appTimeZone(): string {
  const zone = process.env.APP_TIMEZONE?.trim() || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(`APP_TIMEZONE "${zone}" isn't a time zone name like America/New_York`);
  }
  return zone;
}

export function isDay(value: string): value is Day {
  // Date.parse rolls "2026-02-30" over to March, so check it comes back unchanged.
  if (!DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

type Env = Record<string, string | undefined>;

/** The day he started fresh. The calendar was an everyday one before, so earlier events are noise. */
export const TRACKING_STARTED: Day = "2026-10-20";

/**
 * The first gig date the app tracks. Events before it are ignored and removed. TRACK_FROM
 * overrides TRACKING_STARTED with another date, or "all" for everything (null).
 */
export function trackFrom(env: Env = process.env): Day | null {
  const value = env.TRACK_FROM?.trim();
  if (!value) return TRACKING_STARTED;
  if (value.toLowerCase() === "all") return null;
  if (!isDay(value)) throw new Error(`TRACK_FROM must be a date like 2025-01-01, not "${value}"`);
  return value;
}

/** The calendar day an instant falls on in the given time zone. */
export function dayInZone(instant: Date, timeZone: string): Day {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** A day from its local-time parts, e.g. from a Date that stands for local midnight. */
export function dayFromLocalParts(date: Date): Day {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The UTC-midnight Date Prisma uses for a `@db.Date` column. */
export function dayToDate(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The day stored in a `@db.Date` column. */
export function dateToDay(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((dayToDate(to).getTime() - dayToDate(from).getTime()) / MS_PER_DAY);
}

export function addDays(day: Day, days: number): Day {
  return dateToDay(new Date(dayToDate(day).getTime() + days * MS_PER_DAY));
}
