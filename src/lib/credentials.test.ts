import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarSettings, type CalendarFields, decrypt, encrypt, icloudCredentials, parseCalendarFields } from "./credentials";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const env = { CREDENTIALS_KEY: KEY };

describe("encrypt and decrypt", () => {
  it("round trips, and differs each time", () => {
    const one = encrypt("abcd-efgh-ijkl-mnop", "me", env);
    const two = encrypt("abcd-efgh-ijkl-mnop", "me", env);
    expect(one.value).not.toBe(two.value);
    expect(one.value).not.toContain("abcd");
    expect(decrypt(one.value, one.keyVersion, "me", env)).toBe("abcd-efgh-ijkl-mnop");
  });

  it("won't decrypt for another user", () => {
    const { value, keyVersion } = encrypt("secret", "me", env);
    expect(() => decrypt(value, keyVersion, "them", env)).toThrow();
  });

  it("notices tampering", () => {
    const { value, keyVersion } = encrypt("secret", "me", env);
    const [iv, tag, data] = value.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64url")].join("."), keyVersion, "me", env)).toThrow();
  });

  it("won't decrypt with another key", () => {
    const { value, keyVersion } = encrypt("secret", "me", env);
    expect(() => decrypt(value, keyVersion, "me", { CREDENTIALS_KEY: OTHER_KEY })).toThrow();
  });

  it("uses the newest key, and older ones still decrypt", () => {
    const old = encrypt("secret", "me", env);
    expect(old.keyVersion).toBe(1);
    const both = { CREDENTIALS_KEY: KEY, CREDENTIALS_KEY_2: OTHER_KEY };
    const fresh = encrypt("secret", "me", both);
    expect(fresh.keyVersion).toBe(2);
    expect(decrypt(old.value, old.keyVersion, "me", both)).toBe("secret");
    expect(decrypt(fresh.value, fresh.keyVersion, "me", both)).toBe("secret");
    expect(() => decrypt(fresh.value, fresh.keyVersion, "me", env)).toThrow(/version 2/);
  });

  it("refuses a missing or wrong-sized key", () => {
    expect(() => encrypt("secret", "me", {})).toThrow(/CREDENTIALS_KEY isn't set/);
    expect(() => encrypt("secret", "me", { CREDENTIALS_KEY: "  " })).toThrow(/CREDENTIALS_KEY isn't set/);
    expect(() => encrypt("secret", "me", { CREDENTIALS_KEY: "short" })).toThrow(/32 bytes/);
  });
});

const person = { isOwner: false, name: "Sam", timeZone: "Asia/Jerusalem", trackFrom: new Date("2026-01-05") };
const owner = { isOwner: true, name: "", timeZone: "America/New_York", trackFrom: new Date("2026-10-20") };
const stored = encrypt("stored-password", "me", env);
const account = {
  icloudEmail: "me@icloud.com",
  icloudPasswordEnc: stored.value,
  keyVersion: stored.keyVersion,
  gigsCalendar: "Jobs",
  holdsCalendar: null,
  wantedCalendar: "Asked",
};
const ownerEnv = {
  ...env,
  ICLOUD_EMAIL: "owner@icloud.com",
  ICLOUD_APP_PASSWORD: "env-password",
  GIGS_CALENDAR: "Env gigs",
  HOLDS_CALENDAR: "Env holds",
  APP_TIMEZONE: "America/Chicago",
  YOUR_NAME: "Owner",
};

describe("calendarSettings", () => {
  it("gives a user their own values and ignores the env vars", () => {
    expect(calendarSettings(person, null, ownerEnv)).toEqual({
      name: "Sam",
      timeZone: "Asia/Jerusalem",
      zoneProblem: null,
      trackFrom: "2026-01-05",
      names: { gigs: "Gigs", holds: null, wanted: "Wanted" },
      icloudEmail: "",
      connected: false,
      fromEnv: false,
    });
    expect(calendarSettings(person, account, ownerEnv)).toMatchObject({
      names: { gigs: "Jobs", holds: null, wanted: "Asked" },
      icloudEmail: "me@icloud.com",
      connected: true,
    });
  });

  it("uses the env vars for the owner until he saves his own", () => {
    expect(calendarSettings(owner, null, ownerEnv)).toEqual({
      name: "Owner",
      timeZone: "America/Chicago",
      zoneProblem: null,
      trackFrom: "2026-10-20",
      names: { gigs: "Env gigs", holds: "Env holds", wanted: "Wanted" },
      icloudEmail: "owner@icloud.com",
      connected: true,
      fromEnv: true,
    });
    expect(calendarSettings(owner, account, ownerEnv)).toMatchObject({
      name: "",
      timeZone: "America/New_York",
      names: { gigs: "Jobs" },
      fromEnv: false,
    });
  });

  it("isn't connected for an owner with no env vars", () => {
    expect(calendarSettings(owner, null, env)).toMatchObject({ connected: false, fromEnv: true, name: "" });
  });

  it("reports a bad env time zone and counts in New York", () => {
    expect(calendarSettings(owner, null, { APP_TIMEZONE: "Mars/Olympus" })).toMatchObject({
      timeZone: "America/New_York",
      zoneProblem: expect.stringContaining("Mars/Olympus"),
    });
  });

  it("treats no date as tracking everything", () => {
    expect(calendarSettings({ ...person, trackFrom: null }, null, env).trackFrom).toBeNull();
  });
});

describe("icloudCredentials", () => {
  afterEach(() => vi.restoreAllMocks());

  it("decrypts a saved account, for anyone", () => {
    expect(icloudCredentials("me", person, account, env)).toEqual({ email: "me@icloud.com", password: "stored-password" });
    expect(icloudCredentials("me", owner, account, ownerEnv)).toEqual({ email: "me@icloud.com", password: "stored-password" });
  });

  it("never gives the env password to anyone but the owner", () => {
    expect(icloudCredentials("them", person, null, ownerEnv)).toBeNull();
    expect(icloudCredentials("owner", owner, null, ownerEnv)).toEqual({ email: "owner@icloud.com", password: "env-password" });
    expect(icloudCredentials("owner", owner, null, env)).toBeNull();
  });

  it("says to enter it again when it can't be read, without saying why", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => icloudCredentials("them", person, account, env)).toThrow(/Enter it again/);
    expect(() => icloudCredentials("me", person, account, {})).toThrow(/Enter it again/);
  });
});

describe("parseCalendarFields", () => {
  const fields: CalendarFields = {
    name: "  Sam   Levy ",
    timeZone: "Asia/Jerusalem",
    trackFrom: "2026-01-05",
    icloudEmail: " me@icloud.com ",
    gigsCalendar: " Jobs ",
    holdsCalendar: " ",
    wantedCalendar: "",
  };

  it("cleans the values and fills in the usual names", () => {
    expect(parseCalendarFields(fields)).toEqual({
      values: {
        name: "Sam Levy",
        timeZone: "Asia/Jerusalem",
        trackFrom: "2026-01-05",
        icloudEmail: "me@icloud.com",
        gigsCalendar: "Jobs",
        holdsCalendar: null,
        wantedCalendar: "Wanted",
      },
    });
  });

  it("takes no date as everything", () => {
    expect(parseCalendarFields({ ...fields, trackFrom: "" })).toMatchObject({ values: { trackFrom: null } });
  });

  it.each([
    ["email", { icloudEmail: "nope" }],
    ["zone", { timeZone: "Mars/Olympus" }],
    ["empty zone", { timeZone: "" }],
    ["date", { trackFrom: "2026-02-30" }],
    ["long name", { gigsCalendar: "x".repeat(101) }],
    ["same names", { gigsCalendar: "Gigs", holdsCalendar: "gigs" }],
    ["wanted same as gigs", { gigsCalendar: "Gigs", wantedCalendar: "GIGS" }],
    ["wanted same as holds", { holdsCalendar: "Red", wantedCalendar: "red" }],
  ])("refuses a bad %s", (_label, change) => {
    expect(parseCalendarFields({ ...fields, ...change })).toHaveProperty("error");
  });
});
