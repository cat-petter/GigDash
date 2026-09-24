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
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
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
