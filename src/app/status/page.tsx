import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import type { SyncRun } from "@/generated/prisma/client";
import { Card } from "@/components/Card";
import { SyncButton } from "@/components/SyncButton";
import { Badge, CalendarList } from "@/components/CalendarList";
import { listCalendarNames } from "@/lib/caldav";
import type { CalendarNames } from "@/lib/calendar-names";
import { emailsSentToday } from "@/lib/counters";
import { requireUser } from "@/lib/dal";
import { forUser } from "@/lib/db";
import { formatDateTime, plural } from "@/lib/format";
import { DAILY_EMAIL_CAP } from "@/lib/limits";
import { isPending, syncStatus } from "@/lib/run-sync";
import { loadCredentials, loadSettings } from "@/lib/settings-store";

export const metadata: Metadata = { title: "Status · Gigs" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Signs in to iCloud and lists the calendar names, which also tests the password. */
async function Calendars({ userId, names }: { userId: string; names: CalendarNames }) {
  let found: string[];
  try {
    const credentials = await loadCredentials(userId);
    if (!credentials) throw new Error("iCloud isn't connected.");
    found = await listCalendarNames(credentials);
  } catch (error) {
    return <p className="text-sm text-bad">{messageOf(error)}</p>;
  }
  return <CalendarList found={found} names={names} />;
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
  const user = await requireUser("/status");
  const userId = user.id;
  const { timeZone, zoneProblem, trackFrom: from, names, connected } = await loadSettings(userId);
  await connection();
  const now = new Date();

  const scoped = forUser(userId);
  const live = { deletedAt: null };
  const [runs, sync, active, noBookingDate, moved, fellThrough, unreadable] = await Promise.all([
    scoped.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    syncStatus(userId, now),
    scoped.gig.count({ where: live }),
    scoped.gig.count({ where: { ...live, bookedAt: null } }),
    scoped.gig.count({ where: { ...live, status: "job", confirmedAt: { not: null } } }),
    scoped.gig.count({ where: { status: "hold", deletedAt: { not: null } } }),
    scoped.gig.count({ where: { ...live, parseError: { not: null } } }),
  ]);
  const lastGood = runs.find((run) => run.ok);
  const emailsToday = user.isOwner ? await emailsSentToday(now) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-accent">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Status</h1>
        </div>
        {connected && <SyncButton {...sync} />}
      </header>

      {connected ? (
        <Card
          title="Calendars"
          note={`This app reads only "${names.gigs}"${names.holds ? `, "${names.holds}"` : ""} and "${names.wanted}" if it exists. It never changes anything in your calendar.`}
        >
          <Suspense fallback={<p className="text-sm text-muted">Checking iCloud…</p>}>
            <Calendars userId={userId} names={names} />
          </Suspense>
        </Card>
      ) : (
        <Card title="Calendars">
          <p className="text-sm text-muted">
            No iCloud calendar is connected.{" "}
            <Link href="/?tab=settings&section=calendar" className="text-accent">
              Connect it
            </Link>
          </p>
        </Card>
      )}

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
          <Fact
            label="Tracking gigs from"
            value={from ?? "Everything"}
            note={
              from
                ? "Events before this date are ignored, so old titles don't mix up names and places. Change it under Settings → Calendar."
                : "Every event is read. Set a date under Settings → Calendar to leave out older ones."
            }
          />
        </div>
      </Card>

      {emailsToday !== null && (
        <Card title="Sign-in emails">
          <Fact
            label="Sent today"
            value={`${emailsToday} of ${DAILY_EMAIL_CAP}`}
            note={
              emailsToday >= DAILY_EMAIL_CAP ? (
                <span className="text-bad">
                  Today&apos;s cap is reached, so nobody can get a sign-in link until midnight UTC. Everyone already signed
                  in stays signed in.
                </span>
              ) : (
                "The cap keeps sign-ins under Resend's limit of 100 a day. It starts over at midnight UTC."
              )
            }
          />
        </Card>
      )}

      <Card title="Last 10 syncs" note="Syncs run once a day, when you open the dashboard, and when you tap Sync now.">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">
            {connected ? "No syncs yet. Tap Sync now to run the first one." : "No syncs yet. They start once iCloud is connected."}
          </p>
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
