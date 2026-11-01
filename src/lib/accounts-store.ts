import { linksTo } from "./accounts";
import { auth } from "./auth";
import { db, forUser } from "./db";
import { accountCounterKeys } from "./limits";

/** A signed-in device. Selected field by field: a session's token must never reach a page. */
export function listDevices(userId: string, now = new Date()) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    select: { id: true, userAgent: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export type UserSummary = {
  id: string;
  email: string;
  isOwner: boolean;
  /** When their last good sync ended, the same as their own Sync now button shows. */
  lastSyncedAt: Date | null;
};

/**
 * Everyone's email and last sync, for the owner's list. This is the only place that reads across
 * users for a page, so it checks who's asking itself. It reads one user at a time through forUser,
 * and only the time: never a sync's message, which can quote their calendars. One query per user is
 * fine for an owner-only list of a few dozen.
 */
export async function listUsers(asker: { isOwner?: boolean | null }): Promise<UserSummary[]> {
  if (!asker.isOwner) throw new Error("Only the owner can list users");
  const users = await db.user.findMany({
    select: { id: true, email: true, isOwner: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    users.map(async (user) => {
      const run = await forUser(user.id).syncRun.findFirst({
        where: { ok: true },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true },
      });
      return { ...user, lastSyncedAt: run?.finishedAt ?? null };
    }),
  );
}

/**
 * Deletes a user and everything about them, or returns false if there's no such user or it's the
 * owner. The foreign keys cascade to their sessions, gigs, sync runs, names, rules and CalendarAccount,
 * which holds the app password. Sign-in links and limit counters have no foreign key, so they go by hand.
 * A sync running at that moment can't leave anything behind: its writes fail on the same foreign keys.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  const { secret } = await auth.$context;
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) return false;
      const { count } = await tx.user.deleteMany({ where: { id: userId, isOwner: false } });
      if (count === 0) return false;
      const links = await tx.verification.findMany({
        where: { identifier: { startsWith: "magic-link:" } },
        select: { id: true, value: true },
      });
      await tx.verification.deleteMany({ where: { id: { in: linksTo(links, user.email) } } });
      await tx.limitCounter.deleteMany({ where: { key: { in: accountCounterKeys(userId, user.email, secret) } } });
      return true;
    },
    // As long as runSync's own transaction, since this waits for one that's writing this user's gigs.
    { maxWait: 30_000, timeout: 30_000 },
  );
}

/** Removes expired sign-in links and sessions, so an address someone typed or an old IP doesn't stay in the tables. */
export async function pruneExpiredLogins(now = new Date()): Promise<void> {
  const expired = { where: { expiresAt: { lte: now } } };
  await Promise.all([db.verification.deleteMany(expired), db.session.deleteMany(expired)]);
}
