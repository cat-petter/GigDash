import { describe, expect, it } from "vitest";
import { greeting } from "./format";

describe("greeting", () => {
  const at = (iso: string) => greeting(new Date(iso), "America/New_York", "Yechiel");

  it("says morning, afternoon or evening by the hour where he is", () => {
    expect(at("2026-10-29T09:30:00Z")).toBe("Good morning, Yechiel!"); // 5:30 AM in New York
    expect(at("2026-10-29T16:00:00Z")).toBe("Good afternoon, Yechiel!"); // noon
    expect(at("2026-10-29T21:00:00Z")).toBe("Good evening, Yechiel!"); // 5 PM
    expect(at("2026-10-29T06:00:00Z")).toBe("Good evening, Yechiel!"); // 2 AM
  });

  it("leaves the name out when there isn't one", () => {
    expect(greeting(new Date("2026-10-29T16:00:00Z"), "America/New_York")).toBe("Good afternoon!");
  });
});
