import { db } from "./db";
import { DAILY_EMAIL_CAP, dailyEmailKey, type Hit } from "./limits";

/**
 * Adds one to a counter in Postgres, in a single statement, so requests landing on different Vercel
 * instances at once can't both read the same count and slip past a limit.
 */
export const hitCounter: Hit = async (key, windowSeconds) => {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "LimitCounter" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt}::timestamp)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "LimitCounter"."resetAt" <= ${now}::timestamp THEN 1 ELSE "LimitCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "LimitCounter"."resetAt" <= ${now}::timestamp THEN EXCLUDED."resetAt" ELSE "LimitCounter"."resetAt" END
    RETURNING "count", "resetAt"`;
  return row;
};

/** Removes counters whose window has ended. A leftover one is harmless, so the daily cron does this. */
export async function pruneCounters(now = new Date()): Promise<void> {
  await db.limitCounter.deleteMany({ where: { resetAt: { lte: now } } });
}

/** Emails sent today, for the owner's status page. Refused ones are counted too, so it stops at the cap. */
export async function emailsSentToday(now = new Date()): Promise<number> {
  const counter = await db.limitCounter.findUnique({ where: { key: dailyEmailKey(now) } });
  return Math.min(counter?.count ?? 0, DAILY_EMAIL_CAP);
}
