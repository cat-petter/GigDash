import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import type { SyncRun } from "@/generated/prisma/client";
import { Card } from "@/components/Card";
import { SyncButton } from "@/components/SyncButton";
import { calendarNames, listCalendarNames } from "@/lib/caldav";
import { appTimeZone } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDateTime, plural } from "@/lib/format";
import { isPending, syncStatus } from "@/lib/run-sync";
import { requireLogin } from "@/lib/session";

export const metadata: Metadata = { title: "Status · Gigs" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Badge({ tone, children }: { tone: "good" | "bad" | "warn" | "muted"; children: React.ReactNode }) {
  const tones = {
    good: "text-good border-good/40",
    bad: "text-bad border-bad/40",
    warn: "text-warn border-warn/40",
    muted: "text-muted border-line",
  };
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Signs in to iCloud and lists the calendar names, which also tests the password. */
async function Calendars() {
  const names = calendarNames();
  let found: string[];
  try {
    found = await listCalendarNames();
  } catch (error) {
    return <p className="text-sm text-bad">{messageOf(error)}</p>;
  }

  const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase();
  const missing = [
    !found.some((name) => same(name, names.gigs)) && `No calendar is named "${names.gigs}" (GIGS_CALENDAR).`,
    names.holds &&
      !found.some((name) => same(name, names.holds)) &&
      `No calendar is named "${names.holds}" (HOLDS_CALENDAR).`,
  ].filter(Boolean);

  return (
    <>
      <p className="mb-3 text-sm text-good">Signed in to iCloud.</p>
      <ul className="divide-y divide-line text-sm">
        {found.map((name, i) => (
          <li key={`${name}-${i}`} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{name || <em className="text-muted">(no name)</em>}</span>
            {same(name, names.gigs) ? (
              <Badge tone="good">Read as jobs</Badge>
            ) : same(name, names.holds) ? (
              <Badge tone="good">Read as holds</Badge>
            ) : same(name, names.wanted) ? (
              <Badge tone="good">Read as wanted</Badge>
            ) : (
              <Badge tone="muted">Not read</Badge>
            )}
          </li>
        ))}
      </ul>
      {missing.map((problem) => (
        <p key={String(problem)} className="mt-2 text-sm text-bad">
          {problem}
        </p>
      ))}
      {!found.some((name) => same(name, names.wanted)) && (
        <p className="mt-2 text-sm text-muted">
          No &ldquo;{names.wanted}&rdquo; calendar yet. Make one to track dates you were asked for but weren&apos;t free.
        </p>
      )}
      {!names.holds && (
        <p className="mt-2 text-sm text-warn">
          HOLDS_CALENDAR isn&apos;t set, so holds aren&apos;t tracked. Set it once you&apos;ve made the holds calendar.
        </p>
      )}
    </>
  );
}

function RunStatus({ run, now }: { run: SyncRun; now: Date }) {
  if (run.ok) return <Badge tone={run.message ? "warn" : "good"}>{run.message ? "OK, with notes" : "OK"}</Badge>;
  if (run.finishedAt) return <Badge tone="bad">Failed</Badge>;
  if (isPending(run, now)) return <Badge tone="muted">Running</Badge>;
  return <Badge tone="bad">Didn&apos;t finish</Badge>;
}

function Run({ run, now, timeZone }: { run: SyncRun; now: Date; timeZone: string }) {
  const seconds = run.finishedAt ? (run.finishedAt.getTime() - run.startedAt.getTime()) / 1000 : null;
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{formatDateTime(run.startedAt, timeZone)}</span>
        <RunStatus run={run} now={now} />
      </div>
      {run.ok && (
        <p className="mt-1 text-xs text-muted">
          {plural(run.fetched, "event")} read · {run.created} new · {run.updated} changed · {run.deleted} deleted
          {seconds !== null && ` · ${seconds.toFixed(1)}s`}
        </p>
      )}
      {run.message && (
        <ul className={`mt-1 space-y-0.5 text-xs ${run.ok ? "text-warn" : "text-bad"}`}>
          {run.message.split("\n").map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default async function StatusPage() {
  await requireLogin("/status");
  await connection();
  const now = new Date();

  let timeZone: string;
  let zoneProblem: string | null = null;
  try {
    timeZone = appTimeZone();
  } catch (error) {
    timeZone = "UTC";
    zoneProblem = messageOf(error);
  }

  const live = { deletedAt: null };
  const [runs, sync, active, noBookingDate, moved, fellThrough, unreadable] = await Promise.all([
    db.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    syncStatus(now),
    db.gig.count({ where: live }),
    db.gig.count({ where: { ...live, bookedAt: null } }),
    db.gig.count({ where: { ...live, status: "job", confirmedAt: { not: null } } }),
    db.gig.count({ where: { status: "hold", deletedAt: { not: null } } }),
    db.gig.count({ where: { ...live, parseError: { not: null } } }),
  ]);
  const lastGood = runs.find((run) => run.ok);
  const names = calendarNames();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-accent">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Status</h1>
        </div>
        <SyncButton {...sync} />
      </header>

      <Card
        title="Calendars"
        note={`This app reads only "${names.gigs}"${names.holds ? `, "${names.holds}"` : ""} and "${names.wanted}" if it exists. It never changes anything in your calendar.`}
      >
        <Suspense fallback={<p className="text-sm text-muted">Checking iCloud…</p>}>
          <Calendars />
        </Suspense>
      </Card>

      <Card title="Gigs saved">
        <div className="divide-y divide-line">
          <Fact label="Events in the dashboard" value={active.toLocaleString("en-US")} />
          <Fact
            label="Without a booking date"
            value={noBookingDate.toLocaleString("en-US")}
            note={
              <>
                Events that were already in your calendar before the first sync and have no creation date from Apple.
                They&apos;re left out of lead times.
                {lastGood && ` The last sync saw ${plural(lastGood.missingCreated, "event")} with no creation date.`}
              </>
            }
          />
          <Fact
            label="Holds moved into Gigs"
            value={moved.toLocaleString("en-US")}
            note="If you've moved a hold into Gigs and this is still 0, let the developer know: the move isn't being recognised."
          />
          <Fact label="Holds that fell through" value={fellThrough.toLocaleString("en-US")} />
          <Fact label="Titles that couldn't be read" value={unreadable.toLocaleString("en-US")} />
          <Fact label="Time zone" value={timeZone} note={zoneProblem ?? "Lead times and dates are counted in this zone."} />
        </div>
      </Card>

      <Card title="Last 10 syncs" note="Syncs run once a day, when you open the dashboard, and when you tap Sync now.">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No syncs yet. Tap Sync now to run the first one.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <Run key={run.id} run={run} now={now} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
