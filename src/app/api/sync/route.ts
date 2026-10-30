import { type NextRequest, NextResponse } from "next/server";
import type { SyncRun } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { usesEnvCalendar } from "@/lib/dal";
import { safeEqual } from "@/lib/login";
import { OWNER_ID } from "@/lib/owner";
import { runSync, startSync } from "@/lib/run-sync";

// Reading two calendars from iCloud usually takes a few seconds; this leaves plenty of room.
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
  // Only the owner has calendar settings until accounts can add their own.
  const run = await runSync(OWNER_ID);
  return NextResponse.json(summary(run), { status: run.ok ? 200 : 500 });
}

/** The Sync now button. Returns { pending: true } if the sync is still going when this returns. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!usesEnvCalendar(session.user)) {
    return NextResponse.json({ error: "Your iCloud calendar isn't connected yet" }, { status: 409 });
  }
  const run = await startSync(session.user.id, 50_000);
  return NextResponse.json(run ? summary(run) : { pending: true });
}
