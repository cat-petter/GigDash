import { after, type NextRequest, NextResponse } from "next/server";
import type { SyncRun } from "@/generated/prisma/client";
import { pruneExpiredLogins } from "@/lib/accounts-store";
import { auth } from "@/lib/auth";
import { hitCounter, pruneCounters } from "@/lib/counters";
import { manualSyncWait } from "@/lib/limits";
import { safeEqual } from "@/lib/login";
import { runSync, startSync } from "@/lib/run-sync";
import { connectedUserIds, loadSettings } from "@/lib/settings-store";
import { cronStatus, syncOneByOne } from "@/lib/sync-all";

// Reading two calendars from iCloud usually takes a few seconds, so the cron has room for about 10 users.
export const maxDuration = 60;

function summary(run: SyncRun) {
  const { ok, message, fetched, created, updated, deleted, startedAt, finishedAt } = run;
  return { ok, message, fetched, created, updated, deleted, startedAt, finishedAt };
}

/** The daily Vercel cron job. Vercel sends CRON_SECRET as a bearer token. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await Promise.all([pruneCounters(), pruneExpiredLogins()]).catch(console.error);
  const results = await syncOneByOne(await connectedUserIds(), async (userId) => {
    const running = runSync(userId);
    after(() => running);
    return summary(await running);
  });
  const failed = results.filter((result) => !result.ok).length;
  return NextResponse.json({ users: results.length, failed, results }, { status: cronStatus(results) });
}

/** The Sync now button. Returns { pending: true } if the sync is still going when this returns. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await loadSettings(session.user.id)).connected) {
    return NextResponse.json({ error: "Your iCloud calendar isn't connected yet" }, { status: 409 });
  }
  const wait = await manualSyncWait(session.user.id, hitCounter);
  if (wait !== null) {
    return NextResponse.json({ error: "A sync just ran" }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  const run = await startSync(session.user.id, 50_000);
  return NextResponse.json(run ? summary(run) : { pending: true });
}
