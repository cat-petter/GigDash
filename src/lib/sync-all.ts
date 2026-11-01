/** No new sync starts after this long, so the cron can still answer before maxDuration (60 s) ends it. */
export const TOTAL_MS = 50_000;
/** The least time a user gets before the next one goes ahead, unless the total is nearly spent. */
export const MIN_SHARE_MS = 20_000;

type Outcome = { ok: boolean; message: string | null };

/**
 * Syncs each user in turn. One that fails, or hangs on iCloud, is reported and the next one goes
 * ahead. A user who runs out of time keeps syncing in the background; their SyncRun records the end.
 */
export async function syncOneByOne<R extends Outcome>(userIds: string[], sync: (userId: string) => Promise<R>) {
  const deadline = Date.now() + TOTAL_MS;
  const results: ({ userId: string } & (R | Outcome))[] = [];
  for (const [index, userId] of userIds.entries()) {
    const left = deadline - Date.now();
    if (left <= 0) {
      results.push({ userId, ok: false, message: "Not started: the daily sync ran out of time" });
      continue;
    }
    const share = Math.min(left, Math.max(MIN_SHARE_MS, left / (userIds.length - index)));
    results.push({ userId, ...(await settle(userId, sync, share)) });
  }
  return results;
}

async function settle<R extends Outcome>(userId: string, sync: (userId: string) => Promise<R>, ms: number): Promise<R | Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Outcome>((resolve) => {
    const message = `Still running after ${Math.round(ms / 1000)} s, so the next user went ahead`;
    timer = setTimeout(() => resolve({ ok: false, message }), ms);
  });
  try {
    return await Promise.race([sync(userId), late]);
  } catch (error) {
    console.error(`Sync failed for user ${userId}`, error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** 500 only when no one synced, which points at the app, iCloud or a key. One person's revoked password isn't a failed job. */
export function cronStatus(results: { ok: boolean }[]): 200 | 500 {
  return results.length > 0 && results.every((result) => !result.ok) ? 500 : 200;
}
