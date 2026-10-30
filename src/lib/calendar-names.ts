// Which calendars to read. No server-only imports, so the Calendar settings form can use it too.

type Env = Record<string, string | undefined>;

/** Holds is null until there's a holds calendar. Wanted (dates he was asked for but wasn't free) is read only if it exists. */
export type CalendarNames = { gigs: string; holds: string | null; wanted: string };

export function calendarNames(env: Env = {}): CalendarNames {
  return {
    gigs: env.GIGS_CALENDAR?.trim() || "Gigs",
    holds: env.HOLDS_CALENDAR?.trim() || null,
    wanted: env.WANTED_CALENDAR?.trim() || "Wanted",
  };
}

export function sameName(a: string, b: string | null): boolean {
  return b !== null && a.toLowerCase() === b.toLowerCase();
}

/** What's wrong with these names on an account with these calendars, each as a sentence. */
export function calendarProblems(found: string[], names: CalendarNames): string[] {
  const checks: [string, string | null][] = [
    ["gigs", names.gigs],
    ["holds", names.holds],
  ];
  const problems: string[] = [];
  for (const [label, name] of checks) {
    if (name === null) continue;
    const matches = found.filter((entry) => sameName(entry, name)).length;
    if (matches === 0) problems.push(`No calendar is named "${name}", which is set as your ${label} calendar.`);
    if (matches > 1) problems.push(`There are ${matches} calendars named "${name}". Rename one in Apple Calendar.`);
  }
  const wanted = found.filter((entry) => sameName(entry, names.wanted)).length;
  if (wanted > 1) problems.push(`There are ${wanted} calendars named "${names.wanted}". Rename one in Apple Calendar.`);
  return problems;
}
