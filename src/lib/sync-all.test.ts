import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cronStatus, MIN_SHARE_MS, syncOneByOne, TOTAL_MS } from "./sync-all";

const good = { ok: true, message: null, fetched: 3 };
const never = () => new Promise<typeof good>(() => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("syncOneByOne", () => {
  it("syncs one user at a time, in order, and reports each", async () => {
    const events: string[] = [];
    const results = await syncOneByOne(["a", "b"], async (userId) => {
      events.push(`start ${userId}`);
      await Promise.resolve();
      events.push(`end ${userId}`);
      return good;
    });
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
    expect(results).toEqual([
      { userId: "a", ...good },
      { userId: "b", ...good },
    ]);
  });

  it("keeps a failed run's message and goes on to the next user", async () => {
    const results = await syncOneByOne(["a", "b"], async (userId) =>
      userId === "a" ? { ok: false, message: "Couldn't sign in", fetched: 0 } : good,
    );
    expect(results).toEqual([
      { userId: "a", ok: false, message: "Couldn't sign in", fetched: 0 },
      { userId: "b", ...good },
    ]);
  });

  it("goes on when a sync throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const results = await syncOneByOne(["a", "b"], async (userId) => {
      if (userId === "a") throw new Error("database went away");
      return good;
    });
    expect(results).toEqual([
      { userId: "a", ok: false, message: "database went away" },
      { userId: "b", ...good },
    ]);
    expect(log).toHaveBeenCalledOnce();
  });

  it("moves past a user who hangs, after their share of the time", async () => {
    const running = syncOneByOne(["a", "b", "c"], (userId) => (userId === "a" ? never() : Promise.resolve(good)));
    await vi.advanceTimersByTimeAsync(MIN_SHARE_MS);
    expect(await running).toEqual([
      { userId: "a", ok: false, message: "Still running after 20 s, so the next user went ahead" },
      { userId: "b", ...good },
      { userId: "c", ...good },
    ]);
  });

  it("gives a lone user the whole time, as a slow first sync may need it", async () => {
    let settled = false;
    const running = syncOneByOne(["a"], never).then((results) => {
      settled = true;
      return results;
    });
    await vi.advanceTimersByTimeAsync(TOTAL_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await running)[0].ok).toBe(false);
  });

  it("reports the users it had no time to start, and finishes inside the total", async () => {
    const started: string[] = [];
    const running = syncOneByOne(["a", "b", "c", "d"], (userId) => {
      started.push(userId);
      return never();
    });
    await vi.advanceTimersByTimeAsync(TOTAL_MS);
    const results = await running;
    expect(started).toEqual(["a", "b", "c"]);
    expect(results.map((result) => result.ok)).toEqual([false, false, false, false]);
    expect(results[2].message).toBe("Still running after 10 s, so the next user went ahead");
    expect(results[3]).toEqual({ userId: "d", ok: false, message: "Not started: the daily sync ran out of time" });
  });

  it("does nothing with no users", async () => {
    const sync = vi.fn(async () => good);
    expect(await syncOneByOne([], sync)).toEqual([]);
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("cronStatus", () => {
  it("is fine with no users, or when anyone synced", () => {
    expect(cronStatus([])).toBe(200);
    expect(cronStatus([{ ok: true }])).toBe(200);
    expect(cronStatus([{ ok: false }, { ok: true }])).toBe(200);
  });

  it("fails when no one synced", () => {
    expect(cronStatus([{ ok: false }])).toBe(500);
    expect(cronStatus([{ ok: false }, { ok: false }])).toBe(500);
  });
});
