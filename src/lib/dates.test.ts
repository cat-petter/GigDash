import { describe, expect, it } from "vitest";
import { trackFrom } from "./dates";

describe("trackFrom", () => {
  it("is null when TRACK_FROM isn't set", () => {
    expect(trackFrom({})).toBeNull();
    expect(trackFrom({ TRACK_FROM: "  " })).toBeNull();
  });

  it("reads a date", () => {
    expect(trackFrom({ TRACK_FROM: " 2025-06-01 " })).toBe("2025-06-01");
  });

  it("refuses anything that isn't a real date", () => {
    expect(() => trackFrom({ TRACK_FROM: "June 2025" })).toThrow(/TRACK_FROM/);
    expect(() => trackFrom({ TRACK_FROM: "2025-02-30" })).toThrow(/TRACK_FROM/);
  });
});
