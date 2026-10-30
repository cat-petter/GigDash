import { describe, expect, it } from "vitest";
import { belongsToUser, scopeArgs } from "./user-scope";

describe("belongsToUser", () => {
  it("covers the users' tables, not the shared ones", () => {
    for (const model of ["Gig", "SyncRun", "SavedName", "PinnedSpelling", "MatchRule", "CalendarAccount"]) {
      expect(belongsToUser(model)).toBe(true);
    }
    for (const model of ["User", "Session", "Account", "Verification", "RateLimit", "LimitCounter", undefined]) {
      expect(belongsToUser(model)).toBe(false);
    }
  });
});

describe("scopeArgs", () => {
  it("adds the user to every read, even one with no filter", () => {
    for (const operation of ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]) {
      expect(scopeArgs("me", operation)).toEqual({ where: { userId: "me" } });
      expect(scopeArgs("me", operation, { where: { kind: "person" } })).toEqual({
        where: { kind: "person", userId: "me" },
      });
    }
  });

  it("keeps a guessed id from reaching someone else's row", () => {
    for (const operation of ["findUnique", "findUniqueOrThrow", "delete"]) {
      expect(scopeArgs("me", operation, { where: { id: "theirs" } })).toEqual({ where: { id: "theirs", userId: "me" } });
    }
    expect(scopeArgs("me", "update", { where: { id: "theirs" }, data: { label: "x" } })).toEqual({
      where: { id: "theirs", userId: "me" },
      data: { label: "x" },
    });
  });

  it("overrides another user's id in a filter", () => {
    expect(scopeArgs("me", "findMany", { where: { userId: "them" } })).toEqual({ where: { userId: "me" } });
    expect(scopeArgs("me", "deleteMany", { where: { userId: "them" } })).toEqual({ where: { userId: "me" } });
  });

  it("keeps a compound key, so one naming another user finds nothing", () => {
    const where = { id_userId: { id: "a", userId: "them" } };
    expect(scopeArgs("me", "delete", { where })).toEqual({ where: { ...where, userId: "me" } });
  });

  it("makes new rows the user's", () => {
    expect(scopeArgs("me", "create", { data: { kind: "person", userId: "them" } })).toEqual({
      data: { kind: "person", userId: "me" },
    });
    expect(scopeArgs("me", "createMany", { data: [{ uid: "a" }, { uid: "b", userId: "them" }] })).toEqual({
      data: [
        { uid: "a", userId: "me" },
        { uid: "b", userId: "me" },
      ],
    });
    expect(scopeArgs("me", "createManyAndReturn", { data: { uid: "a" } })).toEqual({
      data: [{ uid: "a", userId: "me" }],
    });
  });

  it("won't let an update hand a row to someone else", () => {
    for (const operation of ["update", "updateMany", "updateManyAndReturn"]) {
      expect(scopeArgs("me", operation, { where: { id: "a" }, data: { label: "x", userId: "them" } }).data).toEqual({
        label: "x",
      });
    }
  });

  it("limits both sides of an upsert", () => {
    expect(
      scopeArgs("me", "upsert", {
        where: { userId_kind: { userId: "me", kind: "person" } },
        create: { kind: "person", userId: "them" },
        update: { punctuation: true, userId: "them" },
      }),
    ).toEqual({
      where: { userId_kind: { userId: "me", kind: "person" }, userId: "me" },
      create: { kind: "person", userId: "me" },
      update: { punctuation: true },
    });
  });

  it("refuses an operation it doesn't know", () => {
    expect(() => scopeArgs("me", "somethingNew")).toThrow(/somethingNew/);
  });
});
