// Runs against a real Postgres with `npm run test:db`. Makes its own two users and removes them after,
// so nobody else's rows are touched, but it refuses any database that isn't on this computer anyway.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, listUsers } from "./accounts-store";
import type { fetchGigCalendars } from "./caldav";
import { db, forUser } from "./db";
import { NEW_NAME } from "./names";
import { loadRules, loadSavedNames, mergeNames, moveSpelling, renameName, resetName, resetRules, saveRules } from "./names-store";
import { runSync } from "./run-sync";
import { disconnectCalendar, loadCredentials, loadSettings, saveCalendar } from "./settings-store";

const host = new URL(process.env.DATABASE_URL ?? "postgres://none").hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`test:db only runs on a database on this computer, and DATABASE_URL points at ${host}`);
}

const USER_TABLES = ["Gig", "SyncRun", "SavedName", "PinnedSpelling", "MatchRule", "CalendarAccount"] as const;

const run = randomUUID();
const a = `iso-a-${run}`;
const b = `iso-b-${run}`;
const owner = `iso-owner-${run}`;

const calendar = {
  name: "Test",
  timeZone: "America/New_York",
  trackFrom: null,
  icloudEmail: "test@icloud.invalid",
  gigsCalendar: "Gigs",
  holdsCalendar: null,
  wantedCalendar: "Wanted",
};

function ics(uid: string, title: string, day = "20300115") {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${title}`,
    `DTSTART;VALUE=DATE:${day}`,
    "DTSTAMP:20260101T000000Z",
    "CREATED:20260101T000000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** A fake iCloud with these events in the Gigs calendar. */
function fixture(...events: string[]): typeof fetchGigCalendars {
  return async () => [
    { calendar: "gigs" as const, name: "Gigs", objects: events.map((data) => ({ data, url: "fake" })) },
  ] as never;
}

/** What a user has, for checking that someone else's actions changed nothing. */
async function snapshot(userId: string) {
  const where = { where: { userId } };
  // eslint-disable-next-line no-restricted-syntax -- reading past forUser is the point of this check
  const [gigs, runs, names, pins, rules, account] = await Promise.all([db.gig.findMany(where), db.syncRun.findMany(where), db.savedName.findMany(where), db.pinnedSpelling.findMany(where), db.matchRule.findMany(where), db.calendarAccount.findMany(where)]);
  return { gigs, runs, names, pins, rules, account };
}

/** Runs raw SQL the way forUser's transactions do, optionally with no user set. */
function rawAs<T>(userId: string | null, query: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE gigdash_user`;
    if (userId) await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return query(tx);
  });
}

async function makeUser(id: string, isOwner = false) {
  await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, isOwner } });
}

beforeAll(async () => {
  await makeUser(a);
  await makeUser(b);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [a, b, owner] } } });
  await db.$disconnect();
});

beforeEach(async () => {
  for (const userId of [a, b]) {
    await forUser(userId).gig.deleteMany();
    await forUser(userId).syncRun.deleteMany();
    await forUser(userId).savedName.deleteMany();
    await forUser(userId).matchRule.deleteMany();
    await saveCalendar(userId, calendar, `password-${userId}`);
  }
});

describe("the schema", () => {
  it("has row-level security and a policy on every table with a userId", async () => {
    const tables = await db.$queryRaw<{ table: string; rls: boolean; policies: number }[]>`
      SELECT c.relname AS "table", c.relrowsecurity AS rls,
        (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col ON col.table_schema = n.nspname AND col.table_name = c.relname
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND col.column_name = 'userId'`;
    // Better Auth's own tables have a userId too, but gigdash_user has no access to them at all.
    const mine = tables.filter(({ table }) => !["Session", "Account"].includes(table));
    expect(mine.map(({ table }) => table).sort()).toEqual([...USER_TABLES].sort());
    for (const table of mine) expect(table, table.table).toMatchObject({ rls: true, policies: 1 });
  });

  it("gives the restricted role no way past the policies", async () => {
    const [role] = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }[]>`
      SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'gigdash_user'`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: false });
  });
});

describe("row-level security on raw SQL", () => {
  beforeEach(async () => {
    // Both users have a row in every table, so "nothing" and "only theirs" mean something.
    for (const [userId, title] of [[a, "Kaller job 500 Lakewood"], [b, "Weiss job 600 Monsey"]]) {
      await runSync(userId, fixture(ics("shared-uid", title)));
      const name = await forUser(userId).savedName.create({ data: { userId, kind: "person" } });
      await forUser(userId).pinnedSpelling.create({ data: { userId, kind: "person", key: "x", savedNameId: name.id } });
      await saveRules(userId, "person", { punctuation: true, wordOrder: true, doubleLetters: true, soundAlike: true, oneLetterOff: true, ignoreWords: [] });
    }
  });

  for (const table of USER_TABLES) {
    it(`shows nothing from ${table} with no user set`, async () => {
      const rows = await rawAs(null, (tx) => tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}"`));
      expect(rows).toEqual([]);
    });

    it(`shows only their own ${table} rows`, async () => {
      const rows = await rawAs(a, (tx) => tx.$queryRawUnsafe<{ userId: string }[]>(`SELECT "userId" FROM "${table}"`));
      expect(new Set(rows.map((row) => row.userId))).toEqual(new Set([a]));
    });
  }

  it("shows no one's row in User but their own", async () => {
    const none = await rawAs(null, (tx) => tx.$queryRaw<unknown[]>`SELECT id FROM "User"`);
    expect(none).toEqual([]);
    const own = await rawAs(a, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User"`);
    expect(own).toEqual([{ id: a }]);
  });

  it("can't change or delete another user's rows", async () => {
    const before = await snapshot(b);
    const [updated, deleted] = await rawAs(a, async (tx) => [
      await tx.$executeRaw`UPDATE "Gig" SET "rawTitle" = 'taken' WHERE "userId" = ${b}`,
      await tx.$executeRaw`DELETE FROM "Gig" WHERE "userId" = ${b}`,
    ]);
    expect([updated, deleted]).toEqual([0, 0]);
    expect(await snapshot(b)).toEqual(before);
  });

  it("can't add a row for another user, or hand one over", async () => {
    await expect(rawAs(a, (tx) => tx.$executeRaw`INSERT INTO "SyncRun" (id, "userId") VALUES (${randomUUID()}, ${b})`)).rejects.toThrow();
    await expect(rawAs(a, (tx) => tx.$executeRaw`UPDATE "Gig" SET "userId" = ${b}`)).rejects.toThrow();
  });

  it("can't reach the login tables or make itself the owner", async () => {
    for (const table of ["Session", "Account", "Verification", "RateLimit", "LimitCounter"]) {
      await expect(rawAs(a, (tx) => tx.$queryRawUnsafe(`SELECT * FROM "${table}"`)), table).rejects.toThrow();
    }
    await expect(rawAs(a, (tx) => tx.$executeRaw`UPDATE "User" SET "isOwner" = true WHERE id = ${a}`)).rejects.toThrow();
    await expect(rawAs(a, (tx) => tx.$executeRaw`UPDATE "User" SET email = 'taken@example.invalid' WHERE id = ${a}`)).rejects.toThrow();
    await expect(rawAs(a, (tx) => tx.$executeRaw`DELETE FROM "User" WHERE id = ${a}`)).rejects.toThrow();
  });
});

describe("forUser", () => {
  it("runs as the restricted role with that user's id, and leaves the connection as it was", async () => {
    const [seen] = await forUser(a).$transaction((tx) =>
      tx.$queryRaw<{ who: string; id: string }[]>`SELECT current_user AS who, current_setting('app.user_id') AS id`,
    );
    expect(seen).toEqual({ who: "gigdash_user", id: a });
    const [after] = await db.$queryRaw<{ who: string; id: string | null }[]>`
      SELECT current_user AS who, nullif(current_setting('app.user_id', true), '') AS id`;
    expect(after.who).not.toBe("gigdash_user");
    expect(after.id).toBeNull();
  });

  it("is held back by the policies even where the extension doesn't reach", async () => {
    await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey")));
    // A nested read through the user's own row, and raw SQL: neither gets the extension's filter.
    const own = await forUser(a).user.findMany({ select: { id: true, gigs: { select: { userId: true } } } });
    expect(own.map((user) => user.id)).toEqual([a]);
    const raw = await forUser(a).$transaction((tx) => tx.$queryRaw<unknown[]>`SELECT * FROM "Gig" WHERE "userId" = ${b}`);
    expect(raw).toEqual([]);
  });

  it("can't name another user's row by id", async () => {
    await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey")));
    const before = await snapshot(b);
    const [gig] = before.gigs;
    expect(await forUser(a).gig.findUnique({ where: { id: gig.id } })).toBeNull();
    await expect(forUser(a).gig.update({ where: { id: gig.id }, data: { rawTitle: "taken" } })).rejects.toThrow();
    await expect(forUser(a).gig.delete({ where: { id: gig.id } })).rejects.toThrow();
    expect((await forUser(a).gig.deleteMany({ where: { id: gig.id } })).count).toBe(0);
    expect(await snapshot(b)).toEqual(before);
  });

  it("undoes everything if a transaction fails", async () => {
    await expect(
      forUser(a).$transaction(async (tx) => {
        await tx.syncRun.create({ data: { userId: a, message: "rolled back" } });
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    expect(await forUser(a).syncRun.count({ where: { message: "rolled back" } })).toBe(0);
  });

  it("refuses the array form of $transaction, which wouldn't run as the user", () => {
    const scoped = forUser(a);
    expect(() => scoped.$transaction([])).toThrow("function form");
  });

  it("keeps many users apart when their queries run at once", async () => {
    await runSync(a, fixture(ics("a-1", "Kaller job 500 Lakewood")));
    await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey")));
    const seen = await Promise.all(
      Array.from({ length: 30 }, (_, index) => {
        const userId = index % 2 ? a : b;
        return forUser(userId).gig.findMany({ select: { userId: true } }).then((gigs) => ({ userId, gigs }));
      }),
    );
    for (const { userId, gigs } of seen) expect(gigs).toEqual([{ userId }]);
  });
});

describe("syncing", () => {
  it("leaves the other user alone, even with the same event ids", async () => {
    await runSync(b, fixture(ics("shared-uid", "Weiss job 600 Monsey")));
    await saveRules(b, "person", { punctuation: true, wordOrder: true, doubleLetters: true, soundAlike: true, oneLetterOff: true, ignoreWords: ["mr"] });
    const before = await snapshot(b);

    const first = await runSync(a, fixture(ics("shared-uid", "Kaller job 500 Lakewood"), ics("a-only", "Katz job 800 Monsey")));
    expect(first).toMatchObject({ ok: true, created: 2 });
    // The event's gone from A's calendar, so A's row is marked deleted. B's with the same id must not be.
    const second = await runSync(a, fixture(ics("a-only", "Katz job 800 Monsey")));
    expect(second).toMatchObject({ ok: true, deleted: 1 });

    expect(await snapshot(b)).toEqual(before);
    expect(await forUser(a).gig.count({ where: { deletedAt: { not: null } } })).toBe(1);
  });

  it("counts a first sync per user", async () => {
    await runSync(a, fixture(ics("a-1", "Kaller job 500 Lakewood")));
    const first = await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey")));
    expect(first).toMatchObject({ ok: true, created: 1 });
  });
});

describe("names and rules", () => {
  beforeEach(async () => {
    await runSync(a, fixture(ics("a-1", "Kaller job 500 Lakewood"), ics("a-2", "Katz job 800 Monsey")));
    await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey"), ics("b-2", "Stern job 700 Lakewood")));
  });

  it("refuses another user's saved names through every function, and changes nothing", async () => {
    const saved = await forUser(b).savedName.create({ data: { userId: b, kind: "person", label: "Bs name" } });
    await forUser(b).pinnedSpelling.create({ data: { userId: b, kind: "person", key: "weiss", savedNameId: saved.id } });
    const before = await snapshot(b);

    await expect(renameName(a, "person", saved.id, "taken")).rejects.toThrow();
    await expect(moveSpelling(a, "person", "weiss", saved.id)).rejects.toThrow();
    await expect(moveSpelling(a, "person", "kaller", saved.id)).rejects.toThrow();
    await expect(moveSpelling(a, "person", "weiss", NEW_NAME)).rejects.toThrow();
    await expect(mergeNames(a, "person", saved.id, saved.id)).rejects.toThrow();
    await expect(resetName(a, "person", saved.id)).rejects.toThrow();

    expect(await snapshot(b)).toEqual(before);
  });

  it("can't pin a spelling to another user's name", async () => {
    const saved = await forUser(b).savedName.create({ data: { userId: b, kind: "person" } });
    await expect(forUser(a).pinnedSpelling.create({ data: { userId: a, kind: "person", key: "x", savedNameId: saved.id } })).rejects.toThrow();
  });

  it("keeps each user's rules and saved names to themselves", async () => {
    await saveRules(a, "person", { punctuation: false, wordOrder: false, doubleLetters: false, soundAlike: false, oneLetterOff: false, ignoreWords: ["a-only"] });
    await resetRules(b, "person");
    expect((await loadRules(a)).person.ignoreWords).toEqual(["a-only"]);
    expect((await loadRules(b)).person.ignoreWords).not.toContain("a-only");

    await forUser(a).savedName.create({ data: { userId: a, kind: "place", label: "As place" } });
    expect((await loadSavedNames(a)).place.map((name) => name.label)).toEqual(["As place"]);
    expect((await loadSavedNames(b)).place).toEqual([]);
  });
});

describe("calendar settings", () => {
  it("keeps each user's password apart, and disconnecting only erases one", async () => {
    expect(await loadCredentials(a)).toEqual({ email: calendar.icloudEmail, password: `password-${a}` });
    expect(await loadCredentials(b)).toEqual({ email: calendar.icloudEmail, password: `password-${b}` });
    await disconnectCalendar(a);
    expect(await loadCredentials(a)).toBeNull();
    expect(await loadCredentials(b)).toEqual({ email: calendar.icloudEmail, password: `password-${b}` });
  });

  it("saves the user's own settings as the restricted role", async () => {
    await saveCalendar(a, { ...calendar, name: "Renamed", timeZone: "Asia/Jerusalem" }, "new");
    expect(await loadSettings(a)).toMatchObject({ timeZone: "Asia/Jerusalem" });
    expect(await loadSettings(b)).toMatchObject({ timeZone: "America/New_York" });
  });
});

describe("accounts", () => {
  it("lists each user's own last sync for the owner, without mixing them up", async () => {
    const good = await runSync(a, fixture(ics("a-1", "Kaller job 500 Lakewood")));
    const users = await listUsers({ isOwner: true });
    const find = (id: string) => users.find((user) => user.id === id);
    expect(find(a)?.lastSyncedAt).toEqual(good.finishedAt);
    expect(find(b)?.lastSyncedAt).toBeNull();
    await expect(listUsers({ isOwner: false })).rejects.toThrow();
  });

  it("deleting a user reaches all their rows and no one else's", async () => {
    const gone = `iso-gone-${run}`;
    await makeUser(gone);
    await saveCalendar(gone, calendar, "secret");
    await runSync(gone, fixture(ics("g-1", "Kaller job 500 Lakewood")));
    const name = await forUser(gone).savedName.create({ data: { userId: gone, kind: "person" } });
    await forUser(gone).pinnedSpelling.create({ data: { userId: gone, kind: "person", key: "kaller", savedNameId: name.id } });
    await saveRules(gone, "place", { punctuation: true, wordOrder: true, doubleLetters: true, soundAlike: true, oneLetterOff: true, ignoreWords: [] });
    await runSync(b, fixture(ics("b-1", "Weiss job 600 Monsey")));
    const before = await snapshot(b);

    expect(await deleteAccount(gone)).toBe(true);

    expect(await snapshot(gone)).toEqual({ gigs: [], runs: [], names: [], pins: [], rules: [], account: [] });
    expect(await db.user.findUnique({ where: { id: gone } })).toBeNull();
    expect(await snapshot(b)).toEqual(before);
  });

  it("won't delete the owner", async () => {
    await makeUser(owner, true);
    expect(await deleteAccount(owner)).toBe(false);
    expect(await db.user.findUnique({ where: { id: owner } })).not.toBeNull();
    await db.user.delete({ where: { id: owner } });
  });
});
