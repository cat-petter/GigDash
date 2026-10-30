import { describe, expect, it } from "vitest";
import { isDay, isTimeZone } from "./dates";

describe("isDay", () => {
  it("takes a real date and nothing else", () => {
    expect(isDay("2025-06-01")).toBe(true);
    expect(isDay("June 2025")).toBe(false);
    expect(isDay("2025-02-30")).toBe(false);
  });
});

describe("isTimeZone", () => {
  it("takes a zone name and nothing else", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});
