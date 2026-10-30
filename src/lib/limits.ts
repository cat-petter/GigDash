import { createHmac } from "node:crypto";

// How much of the email quota and iCloud one person can use. The counting itself is in counters.ts;
// what's here doesn't need the database, so it's easy to test.

/** Adds one to a counter and says where it stands. A counter starts over when its window ends. */
export type Hit = (key: string, windowSeconds: number) => Promise<{ count: number; resetAt: Date }>;

/** Links to one mailbox, so the form can't be used to flood someone's inbox. */
export const LINKS_PER_MAILBOX = { max: 3, windowSeconds: 15 * 60 };
/** Links requested from one IP address. */
export const LINKS_PER_IP = { max: 10, windowSeconds: 60 * 60 };
/** Emails sent per UTC day, kept below Resend's 100 a day. */
export const DAILY_EMAIL_CAP = 80;
/** A day counter is named after its date, so it only has to outlast that date. */
const DAILY_WINDOW_SECONDS = 2 * 24 * 60 * 60;
/** Sync now, per user. Syncing on open has its own limit (AUTO_SYNC_AFTER_MS). */
export const MANUAL_SYNC = { max: 1, windowSeconds: 60 };

/** Sign-ins to iCloud from the Calendar settings, per user: wrong passwords could get an Apple account locked. */
export const CONNECTION_CHECKS = { max: 10, windowSeconds: 15 * 60 };

export const DAILY_CAP_MESSAGE = "Gigs has sent all the sign-in emails it can today. Please try again tomorrow.";

/** The same inbox however it's spelled: a+1@x.com and A+2@x.com both reach a@x.com. */
export function mailboxOf(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/** Counter names are hashed, so the table doesn't keep the addresses and IPs of people who tried. */
function hashed(kind: string, value: string, secret: string): string {
  return `${kind}:${createHmac("sha256", secret).update(value).digest("base64url")}`;
}

/**
 * Counts a request for a link, and returns what to tell the person if it's over a limit. The IP goes
 * first, so a blocked address can't also use up someone else's mailbox limit. Call this only after
 * the bot check: otherwise a script could lock anyone out by sending their email with no token.
 */
export async function linkLimitProblem(email: string, ip: string | null, secret: string, hit: Hit): Promise<string | null> {
  const fromIp = await hit(hashed("link-ip", ip ?? "unknown", secret), LINKS_PER_IP.windowSeconds);
  if (fromIp.count > LINKS_PER_IP.max) {
    return "Too many sign-in links have been requested from this network. Try again in an hour.";
  }
  const toMailbox = await hit(hashed("link-email", mailboxOf(email), secret), LINKS_PER_MAILBOX.windowSeconds);
  if (toMailbox.count > LINKS_PER_MAILBOX.max) {
    return "Too many links have been sent to this address. Check your inbox and spam folder, or try again in 15 minutes.";
  }
  return null;
}

function dailyKey(now: Date): string {
  return `emails:${now.toISOString().slice(0, 10)}`;
}

/** Counts an email about to be sent. False means today's cap is used up, and it mustn't be sent. */
export async function spendDailyEmail(hit: Hit, now = new Date()): Promise<boolean> {
  const { count } = await hit(dailyKey(now), DAILY_WINDOW_SECONDS);
  return count <= DAILY_EMAIL_CAP;
}

/** The counter that says how many emails went out today. */
export function dailyEmailKey(now = new Date()): string {
  return dailyKey(now);
}

/** Counts a sign-in to iCloud from the Calendar settings. False means it mustn't be tried. */
export async function connectionCheckAllowed(userId: string, hit: Hit): Promise<boolean> {
  const { count } = await hit(`icloud-check:${userId}`, CONNECTION_CHECKS.windowSeconds);
  return count <= CONNECTION_CHECKS.max;
}

/** Counts a Sync now. Returns how many seconds to wait, or null if it can go ahead. */
export async function manualSyncWait(userId: string, hit: Hit, now = new Date()): Promise<number | null> {
  const { count, resetAt } = await hit(`sync:${userId}`, MANUAL_SYNC.windowSeconds);
  if (count <= MANUAL_SYNC.max) return null;
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}
