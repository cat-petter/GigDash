"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { timeAgo } from "@/lib/format";

const POLL_MS = 3000;
const MAX_POLLS = 20;

type Props = {
  /** When the last successful sync finished (ISO), or null if none has. */
  lastSyncedAt: string | null;
  /** A sync started by someone else, or by opening the page, is still going. */
  running: boolean;
  /** The latest sync's error, if it failed. */
  error: string | null;
  /** The server's clock when the page was rendered (ISO). */
  now: string;
};

export function SyncButton({ lastSyncedAt, running, error, now }: Props) {
  const router = useRouter();
  const [posting, setPosting] = useState(false);
  const [, startRefresh] = useTransition();
  const [clock, setClock] = useState(() => new Date(now));
  const [requestError, setRequestError] = useState<string | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // While a sync is running in the background, refresh until it's done.
  useEffect(() => {
    if (!running) {
      polls.current = 0;
      return;
    }
    if (posting || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      startRefresh(() => router.refresh());
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, posting, router]);

  async function syncNow() {
    setPosting(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) setRequestError(`The sync request failed (${response.status})`);
    } catch {
      setRequestError("Couldn't reach GigDash. Check your connection.");
    } finally {
      setPosting(false);
    }
    polls.current = 0;
    startRefresh(() => router.refresh());
  }

  const busy = posting || running;
  const shownError = requestError ?? (busy ? null : error);

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        type="button"
        onClick={syncNow}
        disabled={busy}
        className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium shadow-sm transition-colors hover:border-accent disabled:opacity-60"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      <p className="text-xs text-muted" aria-live="polite">
        {busy
          ? "Reading your calendars…"
          : lastSyncedAt
            ? `Synced ${timeAgo(new Date(lastSyncedAt), clock)}`
            : "Not synced yet"}
      </p>
      {shownError && (
        <p className="max-w-64 text-xs text-bad">
          Last sync failed: {shownError.split("\n")[0]}{" "}
          <Link href="/status" className="underline">
            Details
          </Link>
        </p>
      )}
    </div>
  );
}
