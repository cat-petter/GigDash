import type { Gig, GigCalendar, GigStatus } from "@/generated/prisma/client";
import { type Day, dayInZone, dayToDate, daysBetween } from "./dates";
import type { IcsEvent } from "./ics";
import { buildLexicon, type Lexicon, parseTitle } from "./parse-title";

/** A Gig row without the columns the database fills in, or whose it is (runSync adds that). */
export type GigData = Omit<Gig, "id" | "userId" | "createdAt" | "updatedAt">;

export type FetchedEvent = IcsEvent & { calendar: GigCalendar };

export type SyncInput = {
  fetched: FetchedEvent[];
  /** Every Gig row, including soft-deleted ones. */
  existing: GigData[];
  /** The calendars fetched this run. Rows from any other calendar are never deleted. */
  fetchedCalendars: GigCalendar[];
  /** UIDs of calendar objects that couldn't be parsed. Their rows are left as they are. */
  keepUids: string[];
  /** True until a sync has succeeded, i.e. while loading events that already existed. */
  backfill: boolean;
  now: Date;
  timeZone: string;
};

export type SyncPlan = {
  create: GigData[];
  /** Only the changed columns, plus lastSeenAt. */
  update: { uid: string; data: Partial<GigData> }[];
  /** Rows that didn't change and only need lastSeenAt bumped. */
  seen: string[];
  /** UIDs to soft-delete. */
  delete: string[];
  warnings: string[];
};

const STATUS: Record<GigCalendar, GigStatus> = { gigs: "job", holds: "hold", wanted: "wanted" };

function titleFields(title: string, lexicon: Lexicon) {
  const parsed = parseTitle(title, lexicon);
  if (!parsed.ok) {
    return {
      titleKeyword: null,
      person: null,
      personKey: null,
      price: null,
      location: null,
      locationKey: null,
      parseError: parsed.error,
    };
  }
  return {
    titleKeyword: parsed.keyword,
    person: parsed.person,
    personKey: parsed.personKey,
    price: parsed.price,
    location: parsed.location,
    locationKey: parsed.locationKey,
    parseError: null,
  };
}

function leadDays(bookedAt: Date | null, gigDate: Day, timeZone: string): number | null {
  return bookedAt ? daysBetween(dayInZone(bookedAt, timeZone), gigDate) : null;
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a.getTime() <= b.getTime() ? a : b;
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** When a hold was moved into Gigs, as best we can tell. */
function confirmedTime(event: FetchedEvent, row: GigData, now: Date): Date {
  // LAST-MODIFIED is the move itself if it's newer than the last time we saw the hold.
  const modified = event.lastModified;
  if (modified && modified.getTime() > row.lastSeenAt.getTime()) {
    return modified.getTime() < now.getTime() ? modified : now;
  }
  return now;
}

function newRow(event: FetchedEvent, input: SyncInput, lexicon: Lexicon): GigData {
  const { now, backfill, timeZone } = input;
  const status = STATUS[event.calendar];
  // Without CREATED, the first time we see an event is close to when he entered it,
  // except for the events that were already there before the first sync.
  const bookedAt = event.created ?? (backfill ? null : now);
  return {
    uid: event.uid,
    rawTitle: event.title,
    calendar: event.calendar,
    status,
    ...titleFields(event.title, lexicon),
    gigDate: dayToDate(event.gigDate),
    bookedAt,
    leadDays: leadDays(bookedAt, event.gigDate, timeZone),
    heldAt: status === "hold" ? bookedAt : null,
    confirmedAt: null,
    recurring: event.hasRRule,
    deletedAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function updatedRow(event: FetchedEvent, row: GigData, input: SyncInput, lexicon: Lexicon): GigData {
  const { now, timeZone } = input;
  const status = STATUS[event.calendar];
  // Moving an event between calendars may give it a new CREATED. Lead time for a
  // confirmed hold counts from when the hold was first entered.
  const bookedAt = earliest(row.bookedAt, event.created);

  let { heldAt, confirmedAt } = row;
  if (row.status === "hold" && status === "job") {
    confirmedAt = row.confirmedAt ?? confirmedTime(event, row, now);
  } else if (row.status === "job" && status === "hold") {
    heldAt = row.heldAt ?? now;
    confirmedAt = null;
  }

  return {
    ...row,
    rawTitle: event.title,
    calendar: event.calendar,
    status,
    ...titleFields(event.title, lexicon),
    gigDate: dayToDate(event.gigDate),
    bookedAt,
    leadDays: leadDays(bookedAt, event.gigDate, timeZone),
    heldAt,
    confirmedAt,
    recurring: event.hasRRule,
    deletedAt: null,
    lastSeenAt: now,
  };
}

function changes(before: GigData, after: GigData): Partial<GigData> {
  const diff: Partial<Record<keyof GigData, unknown>> = {};
  for (const key of Object.keys(after) as (keyof GigData)[]) {
    if (key === "lastSeenAt") continue;
    if (!same(before[key], after[key])) diff[key] = after[key];
  }
  return diff as Partial<GigData>;
}

/** Keeps one event per UID. An event caught mid-move can show up in both calendars. */
function dedupe(fetched: FetchedEvent[], warnings: string[]): Map<string, FetchedEvent> {
  const byUid = new Map<string, FetchedEvent>();
  for (const event of fetched) {
    const other = byUid.get(event.uid);
    if (!other) {
      byUid.set(event.uid, event);
      continue;
    }
    const kept = event.calendar === "gigs" && other.calendar !== "gigs" ? event : other;
    byUid.set(event.uid, kept);
    warnings.push(
      `"${event.title}" (${event.gigDate}) was found twice; using the one in the ${kept.calendar} calendar`,
    );
  }
  return byUid;
}

/** Works out the database writes that bring the Gig rows in line with the calendars. */
export function planSync(input: SyncInput): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], seen: [], delete: [], warnings: [] };
  const events = dedupe(input.fetched, plan.warnings);
  const rows = new Map(input.existing.map((row) => [row.uid, row]));
  // Names and places are learned from every title, so all of them are re-read each sync.
  const lexicon = buildLexicon([
    ...[...events.values()].map((event) => event.title),
    ...input.existing.filter((row) => !events.has(row.uid)).map((row) => row.rawTitle),
  ]);

  for (const event of events.values()) {
    const row = rows.get(event.uid);
    if (!row) {
      plan.create.push(newRow(event, input, lexicon));
      continue;
    }
    const diff = changes(row, updatedRow(event, row, input, lexicon));
    if (Object.keys(diff).length === 0) {
      plan.seen.push(row.uid);
    } else {
      plan.update.push({ uid: row.uid, data: { ...diff, lastSeenAt: input.now } });
    }
  }

  const missing = input.existing.filter(
    (row) =>
      !row.deletedAt &&
      !events.has(row.uid) &&
      input.fetchedCalendars.includes(row.calendar) &&
      !input.keepUids.includes(row.uid),
  );
  if (missing.length > 0 && events.size === 0) {
    // An empty answer from iCloud is far more likely a glitch than every gig being deleted.
    plan.warnings.push(`No events came back, so the ${missing.length} saved gigs were kept`);
  } else {
    plan.delete = missing.map((row) => row.uid);
  }

  return plan;
}

