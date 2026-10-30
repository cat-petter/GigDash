import { describe, expect, it } from "vitest";
import { calendarNames, calendarProblems } from "./calendar-names";

describe("calendarNames", () => {
  it("falls back to the usual names, with no holds calendar", () => {
    expect(calendarNames()).toEqual({ gigs: "Gigs", holds: null, wanted: "Wanted" });
    expect(calendarNames({ GIGS_CALENDAR: "  ", HOLDS_CALENDAR: "" }).holds).toBeNull();
  });

  it("reads the environment", () => {
    expect(calendarNames({ GIGS_CALENDAR: " Jobs ", HOLDS_CALENDAR: "Red", WANTED_CALENDAR: "Asked" })).toEqual({
      gigs: "Jobs",
      holds: "Red",
      wanted: "Asked",
    });
  });
});

describe("calendarProblems", () => {
  const names = { gigs: "Gigs", holds: "Holds", wanted: "Wanted" };

  it("is happy when they're there, whatever the case", () => {
    expect(calendarProblems(["gigs", "HOLDS", "Home"], names)).toEqual([]);
  });

  it("doesn't need a holds calendar when none is set, or a wanted one at all", () => {
    expect(calendarProblems(["Gigs"], { ...names, holds: null })).toEqual([]);
  });

  it("names what's missing", () => {
    expect(calendarProblems(["Home"], names)).toEqual([
      'No calendar is named "Gigs", which is set as your gigs calendar.',
      'No calendar is named "Holds", which is set as your holds calendar.',
    ]);
  });

  it("refuses a name more than one calendar has", () => {
    expect(calendarProblems(["Gigs", "gigs", "Holds"], names)[0]).toMatch(/2 calendars named "Gigs"/);
    expect(calendarProblems(["Gigs", "Holds", "Wanted", "wanted"], names)[0]).toMatch(/2 calendars named "Wanted"/);
  });
});
