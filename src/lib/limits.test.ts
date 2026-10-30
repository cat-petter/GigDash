import { describe, expect, it } from "vitest";
import {
  DAILY_EMAIL_CAP,
  dailyEmailKey,
  type Hit,
  LINKS_PER_IP,
  LINKS_PER_MAILBOX,
  linkLimitProblem,
  mailboxOf,
  manualSyncWait,
  spendDailyEmail,
} from "./limits";

const NOW = new Date("2026-10-30T12:00:00Z");

/** Counters in memory, with the same windows as the table. */
function counters(start = NOW) {
  const rows = new Map<string, { count: number; resetAt: Date }>();
  let clock = start;
  const hit: Hit = async (key, windowSeconds) => {
    const row = rows.get(key);
    const next =
      row && row.resetAt > clock
        ? { count: row.count + 1, resetAt: row.resetAt }
        : { count: 1, resetAt: new Date(clock.getTime() + windowSeconds * 1000) };
    rows.set(key, next);
    return next;
  };
  return { hit, rows, advance: (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000)) };
}

const ask = (email: string, ip: string | null, hit: Hit) => linkLimitProblem(email, ip, "secret", hit);

describe("mailboxOf", () => {
  it("treats spellings of one inbox as one", () => {
    expect(mailboxOf(" Someone+gigs@Example.com ")).toBe("someone@example.com");
    expect(mailboxOf("someone+a+b@example.com")).toBe("someone@example.com");
    expect(mailboxOf("someone@example.com")).toBe("someone@example.com");
  });
});

describe("linkLimitProblem", () => {
  it("allows a few links to a mailbox, then refuses until the window ends", async () => {
    const { hit, advance } = counters();
    for (let i = 0; i < LINKS_PER_MAILBOX.max; i++) expect(await ask("a@example.com", "1.1.1.1", hit)).toBeNull();
    expect(await ask("a@example.com", "2.2.2.2", hit)).toMatch(/this address/);
    expect(await ask("A+other@example.com", "3.3.3.3", hit)).toMatch(/this address/);
    expect(await ask("b@example.com", "1.1.1.1", hit)).toBeNull();
    advance(LINKS_PER_MAILBOX.windowSeconds);
    expect(await ask("a@example.com", "1.1.1.1", hit)).toBeNull();
  });

  it("refuses an IP after too many links, whichever addresses they're for", async () => {
    const { hit, advance } = counters();
    for (let i = 0; i < LINKS_PER_IP.max; i++) expect(await ask(`${i}@example.com`, "1.1.1.1", hit)).toBeNull();
    expect(await ask("new@example.com", "1.1.1.1", hit)).toMatch(/this network/);
    expect(await ask("new@example.com", "2.2.2.2", hit)).toBeNull();
    advance(LINKS_PER_IP.windowSeconds);
    expect(await ask("new@example.com", "1.1.1.1", hit)).toBeNull();
  });

  it("doesn't count a blocked IP's request against the mailbox", async () => {
    const { hit } = counters();
    for (let i = 0; i < LINKS_PER_IP.max; i++) await ask(`${i}@example.com`, "1.1.1.1", hit);
    for (let i = 0; i < LINKS_PER_MAILBOX.max + 1; i++) await ask("victim@example.com", "1.1.1.1", hit);
    expect(await ask("victim@example.com", "2.2.2.2", hit)).toBeNull();
  });

  it("puts requests with no IP in one bucket instead of skipping the limit", async () => {
    const { hit } = counters();
    for (let i = 0; i < LINKS_PER_IP.max; i++) expect(await ask(`${i}@example.com`, null, hit)).toBeNull();
    expect(await ask("new@example.com", null, hit)).toMatch(/this network/);
  });

  it("doesn't keep addresses or IPs in the counter names", async () => {
    const { hit, rows } = counters();
    await ask("someone@example.com", "1.2.3.4", hit);
    const keys = [...rows.keys()].join(" ");
    expect(rows.size).toBe(2);
    expect(keys).not.toContain("someone");
    expect(keys).not.toContain("1.2.3.4");
  });
});

describe("spendDailyEmail", () => {
  it("allows the cap and no more, and starts over the next UTC day", async () => {
    const { hit } = counters();
    for (let i = 0; i < DAILY_EMAIL_CAP; i++) expect(await spendDailyEmail(hit, NOW)).toBe(true);
    expect(await spendDailyEmail(hit, NOW)).toBe(false);
    expect(await spendDailyEmail(hit, new Date("2026-10-31T00:00:00Z"))).toBe(true);
  });

  it("stays under Resend's 100 a day", () => {
    expect(DAILY_EMAIL_CAP).toBeLessThan(100);
  });

  it("names the counter after the UTC date", () => {
    expect(dailyEmailKey(new Date("2026-10-30T23:59:59Z"))).toBe("emails:2026-10-30");
    expect(dailyEmailKey(new Date("2026-10-31T00:00:00Z"))).toBe("emails:2026-10-31");
  });
});

describe("manualSyncWait", () => {
  it("allows one sync a minute per user, and says how long to wait", async () => {
    const { hit, advance } = counters();
    expect(await manualSyncWait("a", hit, NOW)).toBeNull();
    expect(await manualSyncWait("a", hit, NOW)).toBe(60);
    expect(await manualSyncWait("b", hit, NOW)).toBeNull();
    advance(60);
    expect(await manualSyncWait("a", hit, NOW)).toBeNull();
  });
});
