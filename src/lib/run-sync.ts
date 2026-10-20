import { after } from "next/server";
import type { GigCalendar, SyncRun } from "@/generated/prisma/client";
import { calendarNames, fetchGigCalendars } from "./caldav";
import { appTimeZone, dayToDate, trackFrom } from "./dates";
import { db } from "./db";
import { findUid, parseIcs } from "./ics";
import { type FetchedEvent, planSync } from "./sync";

/** The dashboard syncs on open when the last sync started longer ago than this. */
export const AUTO_SYNC_AFTER_MS = 10 * 60 * 1000;
/** A run that hasn't finished after this long is assumed to have crashed. */
const PENDING_MS = 2 * 60 * 1000;
/** Any fixed number, so that two syncs at once take turns writing. */
const LOCK_ID = 7231;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetches both calendars and brings the Gig rows in line, recording a SyncRun. */
export async function runSync(fetchCalendars = fetchGigCalendars): Promise<SyncRun> {
  const run = await db.syncRun.create({ data: {} });
  try {
    const timeZone = appTimeZone();
    const names = calendarNames();
    const from = trackFrom();
    const calendars = await fetchCalendars(names);

    const warnings: string[] = [];
    if (!names.holds) warnings.push("HOLDS_CALENDAR isn't set, so only Gigs was read");

    const fetched: FetchedEvent[] = [];
    const keepUids: string[] = [];
    const fetchedCalendars: GigCalendar[] = [];
    for (const { calendar, name, objects } of calendars) {
      let complete = true;
      for (const object of objects) {
        if (object.data === null) {
          warnings.push(`iCloud didn't send the contents of an event in "${name}"`);
          complete = false;
          continue;
        }
        try {
          for (const event of parseIcs(object.data, timeZone)) fetched.push({ ...event, calendar });
        } catch (error) {
          warnings.push(`Couldn't read an event in "${name}": ${messageOf(error)}`);
          const uid = findUid(object.data);
          if (uid) keepUids.push(uid);
          else complete = false;
        }
      }
      // Without its UID, a bad event can't be told apart from a deleted one.
      if (complete) fetchedCalendars.push(calendar);
      else warnings.push(`Nothing in "${name}" was marked deleted this time, since an event couldn't be read`);
    }

    // Everything before TRACK_FROM is left out, so old titles don't confuse the names and places.
    const tracked = from ? fetched.filter((event) => event.gigDate >= from) : fetched;

    const plan = await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
        const now = new Date();
        const backfill = (await tx.syncRun.count({ where: { ok: true } })) === 0;
        if (from) await tx.gig.deleteMany({ where: { gigDate: { lt: dayToDate(from) } } });
        const existing = await tx.gig.findMany();
        const plan = planSync({ fetched: tracked, existing, fetchedCalendars, keepUids, backfill, now, timeZone });

        if (plan.create.length > 0) await tx.gig.createMany({ data: plan.create });
        for (const { uid, data } of plan.update) await tx.gig.update({ where: { uid }, data });
        if (plan.seen.length > 0) {
          await tx.gig.updateMany({ where: { uid: { in: plan.seen } }, data: { lastSeenAt: now } });
        }
        if (plan.delete.length > 0) {
          await tx.gig.updateMany({ where: { uid: { in: plan.delete } }, data: { deletedAt: now } });
        }
        return plan;
      },
      { maxWait: 30_000, timeout: 30_000 },
    );

    return await db.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: true,
        message: [...warnings, ...plan.warnings].join("\n") || null,
        fetched: tracked.length,
        created: plan.create.length,
        updated: plan.update.length,
        deleted: plan.delete.length,
        missingCreated: tracked.filter((event) => !event.created).length,
      },
    });
  } catch (error) {
    return db.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, message: messageOf(error) },
    });
  }
}

export function latestRun(): Promise<SyncRun | null> {
  return db.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
}

export function lastGoodRun(): Promise<SyncRun | null> {
  return db.syncRun.findFirst({ where: { ok: true }, orderBy: { startedAt: "desc" } });
}

export function isPending(run: SyncRun | null, now = new Date()): boolean {
  return Boolean(run && !run.finishedAt && now.getTime() - run.startedAt.getTime() < PENDING_MS);
}

/** What the Sync now button needs to show. */
export async function syncStatus(now = new Date()) {
  const [latest, good] = await Promise.all([latestRun(), lastGoodRun()]);
  return {
    lastSyncedAt: good?.finishedAt?.toISOString() ?? null,
    running: isPending(latest, now),
    error: latest?.finishedAt && !latest.ok ? latest.message : null,
    now: now.toISOString(),
  };
}

/**
 * Starts a sync unless one is already running, and waits up to `waitMs` for it.
 * Returns the finished run, or null if it's still going. It keeps running after
 * the response is sent.
 */
export async function startSync(waitMs: number): Promise<SyncRun | null> {
  if (isPending(await latestRun())) return null;
  const running = runSync();
  after(() => running);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([running, timeout]);
}

/** Syncs when the dashboard opens, if the last sync is more than 10 minutes old. */
export async function autoSync(waitMs = 2000): Promise<void> {
  const last = await latestRun();
  if (last && Date.now() - last.startedAt.getTime() < AUTO_SYNC_AFTER_MS) return;
  await startSync(waitMs);
}
