import { describe, expect, it } from "vitest";
import { TRACKING_STARTED, trackFrom } from "./dates";

describe("trackFrom", () => {
  it("starts from the day he started fresh when TRACK_FROM isn't set", () => {
    expect(trackFrom({})).toBe(TRACKING_STARTED);
    expect(trackFrom({ TRACK_FROM: "  " })).toBe(TRACKING_STARTED);
  });

  it("reads everything for 'all'", () => {
    expect(trackFrom({ TRACK_FROM: "all" })).toBeNull();
  });

  it("reads a date", () => {
    expect(trackFrom({ TRACK_FROM: " 2025-06-01 " })).toBe("2025-06-01");
  });

  it("refuses anything that isn't a real date", () => {
    expect(() => trackFrom({ TRACK_FROM: "June 2025" })).toThrow(/TRACK_FROM/);
    expect(() => trackFrom({ TRACK_FROM: "2025-02-30" })).toThrow(/TRACK_FROM/);
  });
});
