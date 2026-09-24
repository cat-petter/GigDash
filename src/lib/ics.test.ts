import { afterEach, describe, expect, it } from "vitest";
import { findUid, parseIcs } from "./ics";

const TZ = "America/New_York";

function calendar(...lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apple Inc.//iOS 18.0//EN", ...lines, "END:VCALENDAR", ""].join(
    "\r\n",
  );
}

function event(...lines: string[]): string[] {
  return ["BEGIN:VEVENT", "DTSTAMP:20260320T120000Z", ...lines, "END:VEVENT"];
}

// What iCloud sends for an all-day event.
const allDay = calendar(
  ...event(
    "UID:5F0C1A2B-1111-4AAA-9BBB-000000000001",
    "CREATED:20260315T142233Z",
    "LAST-MODIFIED:20260318T010203Z",
    "DTSTART;VALUE=DATE:20261101",
    "DTEND;VALUE=DATE:20261102",
    "SUMMARY:Kaller job 600 neemas hachaim",
  ),
);

describe("parseIcs", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("reads an all-day event", () => {
    expect(parseIcs(allDay, TZ)).toEqual([
      {
        uid: "5F0C1A2B-1111-4AAA-9BBB-000000000001",
        title: "Kaller job 600 neemas hachaim",
        gigDate: "2026-11-01",
        created: new Date("2026-03-15T14:22:33Z"),
        lastModified: new Date("2026-03-18T01:02:03Z"),
        hasRRule: false,
      },
    ]);
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])(
    "keeps the all-day date when the server runs in %s",
    (serverTz) => {
      process.env.TZ = serverTz;
      expect(parseIcs(allDay, TZ)[0].gigDate).toBe("2026-11-01");
    },
  );

  it("returns null for missing CREATED and LAST-MODIFIED", () => {
    const [parsed] = parseIcs(calendar(...event("UID:a", "DTSTART;VALUE=DATE:20261101", "SUMMARY:Kaller hold")), TZ);
    expect(parsed).toMatchObject({ created: null, lastModified: null });
  });

  it("flags a repeating event and uses its first date", () => {
    const [parsed] = parseIcs(
      calendar(
        ...event("UID:r", "DTSTART;VALUE=DATE:20261101", "RRULE:FREQ=WEEKLY;COUNT=4", "SUMMARY:Kaller job"),
        // An edited occurrence arrives as a second VEVENT with the same UID.
        ...event("UID:r", "RECURRENCE-ID;VALUE=DATE:20261108", "DTSTART;VALUE=DATE:20261109", "SUMMARY:Kaller job"),
      ),
      TZ,
    ).filter((e) => e.uid === "r");
    expect(parsed).toMatchObject({ gigDate: "2026-11-01", hasRRule: true });
  });

  it("returns one event for a repeating event with an edited occurrence", () => {
    const events = parseIcs(
      calendar(
        ...event("UID:r", "DTSTART;VALUE=DATE:20261101", "RRULE:FREQ=WEEKLY;COUNT=4", "SUMMARY:Kaller job"),
        ...event("UID:r", "RECURRENCE-ID;VALUE=DATE:20261108", "DTSTART;VALUE=DATE:20261109", "SUMMARY:Kaller job"),
      ),
      TZ,
    );
    expect(events).toHaveLength(1);
  });

  it("uses the local day in APP_TIMEZONE for a timed event", () => {
    // 10pm in New York is already the next day in UTC.
    const [parsed] = parseIcs(
      calendar(...event("UID:t", "DTSTART;TZID=America/New_York:20261101T220000", "SUMMARY:Kaller job")),
      TZ,
    );
    expect(parsed.gigDate).toBe("2026-11-01");

    const [utc] = parseIcs(calendar(...event("UID:u", "DTSTART:20261102T023000Z", "SUMMARY:Kaller job")), TZ);
    expect(utc.gigDate).toBe("2026-11-01");
  });

  it("reads a title with parameters and escaped commas", () => {
    const [withLanguage] = parseIcs(
      calendar(...event("UID:l", "DTSTART;VALUE=DATE:20261101", "SUMMARY;LANGUAGE=en:Kaller job")),
      TZ,
    );
    expect(withLanguage.title).toBe("Kaller job");

    const [escaped] = parseIcs(
      calendar(...event("UID:e", "DTSTART;VALUE=DATE:20261101", "SUMMARY:Kaller job 600 boro park\\, brooklyn")),
      TZ,
    );
    expect(escaped.title).toBe("Kaller job 600 boro park, brooklyn");
  });

  it("gives an empty title when SUMMARY is missing", () => {
    const [parsed] = parseIcs(calendar(...event("UID:n", "DTSTART;VALUE=DATE:20261101")), TZ);
    expect(parsed.title).toBe("");
  });

  it("ignores components that aren't events", () => {
    const text = calendar("BEGIN:VTODO", "UID:todo", "SUMMARY:Buy strings", "END:VTODO");
    expect(parseIcs(text, TZ)).toEqual([]);
  });

  it("throws when an event has no UID", () => {
    expect(() => parseIcs(calendar(...event("DTSTART;VALUE=DATE:20261101", "SUMMARY:x")), TZ)).toThrow("no UID");
  });

  it("throws when an event has no usable start date", () => {
    expect(() => parseIcs(calendar(...event("UID:x", "SUMMARY:x")), TZ)).toThrow("no start date");
    expect(() => parseIcs(calendar(...event("UID:x", "DTSTART;VALUE=DATE:2026ab01")), TZ)).toThrow("no start date");
  });
});

describe("findUid", () => {
  it("finds the UID, including a folded one", () => {
    expect(findUid(allDay)).toBe("5F0C1A2B-1111-4AAA-9BBB-000000000001");
    expect(findUid("BEGIN:VEVENT\r\nUID:abc\r\n def\r\nEND:VEVENT")).toBe("abcdef");
  });

  it("returns null when there is no UID", () => {
    expect(findUid("BEGIN:VEVENT\r\nSUMMARY:x\r\nEND:VEVENT")).toBeNull();
  });
});
