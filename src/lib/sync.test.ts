import { describe, expect, it } from "vitest";
import { type FetchedEvent, type GigData, type SyncInput, type SyncPlan, planSync } from "./sync";

const TZ = "America/New_York";

function event(overrides: Partial<FetchedEvent> = {}): FetchedEvent {
  return {
    uid: "uid-1",
    calendar: "gigs",
    title: "Kaller job 600 neemas hachaim",
    gigDate: "2026-11-01",
    created: new Date("2026-03-15T14:00:00Z"),
    lastModified: new Date("2026-03-15T14:00:00Z"),
    hasRRule: false,
    ...overrides,
  };
}

function sync(fetched: FetchedEvent[], existing: GigData[], options: Partial<SyncInput> = {}): SyncPlan {
  return planSync({
    fetched,
    existing,
    fetchedCalendars: ["gigs", "holds"],
    keepUids: [],
    backfill: false,
    now: new Date("2026-09-24T12:00:00Z"),
    timeZone: TZ,
    ...options,
  });
}

/** Applies a plan the way the database would, so tests can run one sync after another. */
function apply(rows: GigData[], plan: SyncPlan, now: Date): GigData[] {
  const next = new Map(rows.map((row) => [row.uid, { ...row }]));
  for (const row of plan.create) next.set(row.uid, row);
  for (const { uid, data } of plan.update) Object.assign(next.get(uid)!, data);
  for (const uid of plan.seen) next.get(uid)!.lastSeenAt = now;
  for (const uid of plan.delete) next.get(uid)!.deletedAt = now;
  return [...next.values()];
}

/** Runs a sync, applies it, and returns the rows. */
function syncAt(when: string, fetched: FetchedEvent[], existing: GigData[], options: Partial<SyncInput> = {}) {
  const now = new Date(when);
  const plan = sync(fetched, existing, { now, ...options });
  return { plan, rows: apply(existing, plan, now) };
}

const find = (rows: GigData[], uid = "uid-1") => rows.find((row) => row.uid === uid)!;

describe("planSync", () => {
  describe("new events", () => {
    it("creates a job with its parsed title and lead time", () => {
      const plan = sync([event()], []);
      expect(plan.create).toEqual([
        {
          uid: "uid-1",
          rawTitle: "Kaller job 600 neemas hachaim",
          calendar: "gigs",
          status: "job",
          titleKeyword: "job",
          person: "Kaller",
          personKey: "kaller",
          price: 600,
          location: "neemas hachaim",
          locationKey: "neemas hachaim",
          parseError: null,
          gigDate: new Date("2026-11-01T00:00:00Z"),
          bookedAt: new Date("2026-03-15T14:00:00Z"),
          leadDays: 231,
          heldAt: null,
          confirmedAt: null,
          recurring: false,
          deletedAt: null,
          firstSeenAt: new Date("2026-09-24T12:00:00Z"),
          lastSeenAt: new Date("2026-09-24T12:00:00Z"),
        },
      ]);
      expect(plan).toMatchObject({ update: [], seen: [], delete: [], warnings: [] });
    });

    it("counts lead time from the booking day in APP_TIMEZONE", () => {
      // 1am UTC on Mar 16 is still Mar 15 in New York.
      const [row] = sync([event({ created: new Date("2026-03-16T01:00:00Z") })], []).create;
      expect(row.leadDays).toBe(231);
    });

    it("keeps a negative lead time for a gig entered after the fact", () => {
      const [row] = sync([event({ gigDate: "2026-03-10" })], []).create;
      expect(row.leadDays).toBe(-5);
    });

    it("creates a hold that was held from when it was entered", () => {
      const [row] = sync([event({ calendar: "holds", title: "Kaller hold" })], []).create;
      expect(row).toMatchObject({
        status: "hold",
        titleKeyword: "hold",
        price: null,
        location: null,
        heldAt: new Date("2026-03-15T14:00:00Z"),
        confirmedAt: null,
      });
    });

    it("stores a title it can't parse and records the error", () => {
      const [row] = sync([event({ title: "job 600" })], []).create;
      expect(row).toMatchObject({
        rawTitle: "job 600",
        status: "job",
        titleKeyword: null,
        person: null,
        price: null,
        parseError: "No name in the title",
      });
    });

    it("reads names and places in any order, using what it learned from his other titles", () => {
      const { create } = sync(
        [
          event({ uid: "a", title: "Kaller job 600 neemas hachaim" }),
          event({ uid: "b", title: "neemas hachaim 700 Kaller" }),
        ],
        [],
      );
      expect(create.find((row) => row.uid === "b")).toMatchObject({
        person: "Kaller",
        price: 700,
        location: "neemas hachaim",
        parseError: null,
      });
    });

    it("lets the calendar decide the status when the title disagrees", () => {
      const [row] = sync([event({ title: "Kaller hold 600" })], []).create;
      expect(row).toMatchObject({ status: "job", titleKeyword: "hold" });
    });

    it("uses the first date of a repeating event and flags it", () => {
      const [row] = sync([event({ hasRRule: true })], []).create;
      expect(row).toMatchObject({ recurring: true, gigDate: new Date("2026-11-01T00:00:00Z") });
    });
  });

  describe("missing CREATED", () => {
    it("leaves the booking date unknown for events loaded by the first sync", () => {
      const [job, hold] = sync(
        [event({ created: null }), event({ uid: "uid-2", calendar: "holds", title: "Kaller hold", created: null })],
        [],
        { backfill: true },
      ).create;
      expect(job).toMatchObject({ bookedAt: null, leadDays: null });
      expect(hold).toMatchObject({ bookedAt: null, leadDays: null, heldAt: null });
    });

    it("uses the first time it was seen for events added after the first sync", () => {
      const [row] = sync([event({ created: null })], []).create;
      expect(row).toMatchObject({ bookedAt: new Date("2026-09-24T12:00:00Z"), leadDays: 38 });
    });

    it("still uses CREATED during the first sync when it's there", () => {
      const [row] = sync([event()], [], { backfill: true }).create;
      expect(row).toMatchObject({ bookedAt: new Date("2026-03-15T14:00:00Z"), leadDays: 231 });
    });
  });

  describe("existing events", () => {
    const first = syncAt("2026-09-01T12:00:00Z", [event()], []).rows;

    it("only bumps lastSeenAt when nothing changed", () => {
      const { plan, rows } = syncAt("2026-09-24T12:00:00Z", [event()], first);
      expect(plan).toMatchObject({ create: [], update: [], seen: ["uid-1"], delete: [] });
      expect(find(rows).lastSeenAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    });

    it("updates only the fields that changed", () => {
      const edited = event({ title: "Kaller job 750 neemas hachaim", gigDate: "2026-11-08" });
      const { plan } = syncAt("2026-09-24T12:00:00Z", [edited], first);
      expect(plan.update).toEqual([
        {
          uid: "uid-1",
          data: {
            rawTitle: "Kaller job 750 neemas hachaim",
            price: 750,
            gigDate: new Date("2026-11-08T00:00:00Z"),
            leadDays: 238,
            lastSeenAt: new Date("2026-09-24T12:00:00Z"),
          },
        },
      ]);
    });

    it("clears the parse error once the title is fixed", () => {
      const broken = syncAt("2026-09-01T12:00:00Z", [event({ title: "Kaller 600" })], []).rows;
      const { rows } = syncAt("2026-09-24T12:00:00Z", [event({ title: "Kaller job 600" })], broken);
      expect(find(rows)).toMatchObject({ parseError: null, person: "Kaller", price: 600 });
    });
  });

  describe("moving a hold into Gigs", () => {
    const hold = event({
      calendar: "holds",
      title: "Kaller hold",
      created: new Date("2026-03-01T15:00:00Z"),
      lastModified: new Date("2026-03-01T15:00:00Z"),
    });
    const held = syncAt("2026-09-01T12:00:00Z", [hold], []).rows;

    it("turns the same row into a job and records when it was confirmed", () => {
      const moved = event({
        title: "Kaller job 600 neemas hachaim",
        // iCloud may reset CREATED on a move. Lead time still counts from the hold.
        created: new Date("2026-09-20T09:00:00Z"),
        lastModified: new Date("2026-09-20T09:00:00Z"),
      });
      const { plan, rows } = syncAt("2026-09-24T12:00:00Z", [moved], held);
      expect(plan.create).toEqual([]);
      expect(plan.delete).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(find(rows)).toMatchObject({
        calendar: "gigs",
        status: "job",
        titleKeyword: "job",
        price: 600,
        bookedAt: new Date("2026-03-01T15:00:00Z"),
        leadDays: 245,
        heldAt: new Date("2026-03-01T15:00:00Z"),
        confirmedAt: new Date("2026-09-20T09:00:00Z"),
      });
    });

    it("keeps the confirmed date on later syncs", () => {
      const moved = event({ lastModified: new Date("2026-09-20T09:00:00Z") });
      const confirmed = syncAt("2026-09-24T12:00:00Z", [moved], held).rows;
      const { plan, rows } = syncAt("2026-09-25T12:00:00Z", [moved], confirmed);
      expect(plan.seen).toEqual(["uid-1"]);
      expect(find(rows).confirmedAt).toEqual(new Date("2026-09-20T09:00:00Z"));
    });

    it("uses the sync time when LAST-MODIFIED is older than the last sync", () => {
      const moved = event({ lastModified: new Date("2026-03-01T15:00:00Z") });
      const { rows } = syncAt("2026-09-24T12:00:00Z", [moved], held);
      expect(find(rows).confirmedAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    });

    it("uses the sync time when LAST-MODIFIED is in the future", () => {
      const moved = event({ lastModified: new Date("2026-12-01T00:00:00Z") });
      const { rows } = syncAt("2026-09-24T12:00:00Z", [moved], held);
      expect(find(rows).confirmedAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    });

    it("clears the confirmed date if the job goes back to holds", () => {
      const confirmed = syncAt("2026-09-24T12:00:00Z", [event()], held).rows;
      const { rows } = syncAt("2026-09-25T12:00:00Z", [hold], confirmed);
      expect(find(rows)).toMatchObject({
        status: "hold",
        heldAt: new Date("2026-03-01T15:00:00Z"),
        confirmedAt: null,
      });
    });

    it("marks a job moved to holds as held from that sync", () => {
      const job = syncAt("2026-09-01T12:00:00Z", [event()], []).rows;
      const { rows } = syncAt("2026-09-24T12:00:00Z", [event({ calendar: "holds" })], job);
      expect(find(rows)).toMatchObject({ status: "hold", heldAt: new Date("2026-09-24T12:00:00Z") });
    });

    it("prefers the copy in Gigs when a mid-move event is in both calendars", () => {
      const { plan, rows } = syncAt("2026-09-24T12:00:00Z", [hold, event()], held);
      expect(find(rows).status).toBe("job");
      expect(plan.warnings).toEqual([
        '"Kaller job 600 neemas hachaim" (2026-11-01) was found twice; using the one in the gigs calendar',
      ]);
    });
  });

  describe("deleted events", () => {
    const two = [event(), event({ uid: "uid-2", calendar: "holds", title: "Yitsy korblue hold" })];
    const saved = syncAt("2026-09-01T12:00:00Z", two, []).rows;

    it("soft-deletes an event that's gone from both calendars", () => {
      const { plan, rows } = syncAt("2026-09-24T12:00:00Z", [event()], saved);
      expect(plan.delete).toEqual(["uid-2"]);
      expect(find(rows, "uid-2").deletedAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    });

    it("doesn't delete it again on the next sync", () => {
      const deleted = syncAt("2026-09-24T12:00:00Z", [event()], saved).rows;
      const { plan, rows } = syncAt("2026-09-25T12:00:00Z", [event()], deleted);
      expect(plan.delete).toEqual([]);
      expect(find(rows, "uid-2").deletedAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    });

    it("brings it back if it reappears", () => {
      const deleted = syncAt("2026-09-24T12:00:00Z", [event()], saved).rows;
      const { plan, rows } = syncAt("2026-09-25T12:00:00Z", two, deleted);
      expect(plan.update).toEqual([
        { uid: "uid-2", data: { deletedAt: null, lastSeenAt: new Date("2026-09-25T12:00:00Z") } },
      ]);
      expect(find(rows, "uid-2").deletedAt).toBeNull();
    });

    it("keeps rows whose calendar object couldn't be read", () => {
      const { plan } = syncAt("2026-09-24T12:00:00Z", [event()], saved, { keepUids: ["uid-2"] });
      expect(plan.delete).toEqual([]);
    });

    it("keeps rows from a calendar that wasn't fetched", () => {
      const { plan } = syncAt("2026-09-24T12:00:00Z", [event()], saved, { fetchedCalendars: ["gigs"] });
      expect(plan.delete).toEqual([]);
    });

    it("keeps everything when no events come back at all", () => {
      const { plan } = syncAt("2026-09-24T12:00:00Z", [], saved);
      expect(plan.delete).toEqual([]);
      expect(plan.warnings).toEqual(["No events came back, so the 2 saved gigs were kept"]);
    });

    it("deletes a hold that fell through even when the holds calendar is now empty", () => {
      const { plan } = syncAt("2026-09-24T12:00:00Z", [event()], saved);
      expect(plan.delete).toEqual(["uid-2"]);
    });
  });

  describe("booking date", () => {
    it("fills it in when CREATED shows up later", () => {
      const unknown = syncAt("2026-09-01T12:00:00Z", [event({ created: null })], [], { backfill: true }).rows;
      const { rows } = syncAt("2026-09-24T12:00:00Z", [event()], unknown);
      expect(find(rows)).toMatchObject({ bookedAt: new Date("2026-03-15T14:00:00Z"), leadDays: 231 });
    });

    it("keeps the earliest one", () => {
      const saved = syncAt("2026-09-01T12:00:00Z", [event()], []).rows;
      const { rows } = syncAt("2026-09-24T12:00:00Z", [event({ created: new Date("2026-06-01T12:00:00Z") })], saved);
      expect(find(rows).bookedAt).toEqual(new Date("2026-03-15T14:00:00Z"));
    });
  });
});
