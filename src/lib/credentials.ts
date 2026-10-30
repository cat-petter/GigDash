import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { type CalendarNames, calendarNames, sameName } from "./calendar-names";
import { dateToDay, type Day, isDay, isTimeZone } from "./dates";
import { looksLikeEmail } from "./login";

type Env = Record<string, string | undefined>;

export type IcloudCredentials = { email: string; password: string };

/** The columns of CalendarAccount this needs. */
type Account = {
  icloudEmail: string;
  icloudPasswordEnc: string;
  keyVersion: number;
  gigsCalendar: string;
  holdsCalendar: string | null;
  wantedCalendar: string;
};

type UserRow = { isOwner: boolean; name: string; timeZone: string; trackFrom: Date | null };

const KEY_BYTES = 32;
const IV_BYTES = 12;
const ALGORITHM = "aes-256-gcm";
const DEFAULT_ZONE = "America/New_York";

/**
 * CREDENTIALS_KEY is version 1. To replace it, add CREDENTIALS_KEY_2: new values use the highest
 * version, and older ones still decrypt until they're saved again.
 */
function keyOf(version: number, env: Env): Buffer | null {
  const variable = version === 1 ? "CREDENTIALS_KEY" : `CREDENTIALS_KEY_${version}`;
  const value = env[variable]?.trim();
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) throw new Error(`${variable} must be ${KEY_BYTES} bytes in base64 (openssl rand -base64 32)`);
  return key;
}

function newestVersion(env: Env): number {
  const versions = Object.keys(env).flatMap((name) => {
    const match = /^CREDENTIALS_KEY(?:_([1-9]\d*))?$/.exec(name);
    if (!match || !env[name]?.trim()) return [];
    return [match[1] ? Number(match[1]) : 1];
  });
  if (versions.length === 0) throw new Error("CREDENTIALS_KEY isn't set");
  return Math.max(...versions);
}

/** Encrypts for one user: their id goes in as additional data, so a value copied to another user's row won't decrypt. */
export function encrypt(secret: string, userId: string, env: Env = process.env): { value: string; keyVersion: number } {
  const keyVersion = newestVersion(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyOf(keyVersion, env)!, iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const value = [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
  return { value, keyVersion };
}

export function decrypt(value: string, keyVersion: number, userId: string, env: Env = process.env): string {
  const key = keyOf(keyVersion, env);
  if (!key) throw new Error(`The key that encrypted this (version ${keyVersion}) isn't set`);
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function envCredentials(env: Env): IcloudCredentials | null {
  const email = env.ICLOUD_EMAIL?.trim();
  const password = env.ICLOUD_APP_PASSWORD?.trim();
  return email && password ? { email, password } : null;
}

/** Everything about a user's calendar and dates except the password, so a page never has to decrypt it. */
export type CalendarSettings = {
  name: string;
  /** Always a real zone. If the environment's isn't, this is New York and zoneProblem says so. */
  timeZone: string;
  zoneProblem: string | null;
  trackFrom: Day | null;
  names: CalendarNames;
  icloudEmail: string;
  /** There are sign-in details to use. Says nothing about whether they work. */
  connected: boolean;
  /** The owner hasn't saved a calendar yet, so all this comes from the old env vars. */
  fromEnv: boolean;
};

/** A user's settings. The owner keeps using the env vars until he saves his own. */
export function calendarSettings(user: UserRow, account: Account | null, env: Env = process.env): CalendarSettings {
  const fromEnv = user.isOwner && !account;
  const zone = (fromEnv && env.APP_TIMEZONE?.trim()) || user.timeZone;
  const zoneOk = isTimeZone(zone);
  const names: CalendarNames = account
    ? { gigs: account.gigsCalendar, holds: account.holdsCalendar, wanted: account.wantedCalendar }
    : calendarNames(fromEnv ? env : {});
  return {
    name: (fromEnv && env.YOUR_NAME?.trim()) || user.name,
    timeZone: zoneOk ? zone : DEFAULT_ZONE,
    zoneProblem: zoneOk ? null : `APP_TIMEZONE "${zone}" isn't a time zone name like America/New_York`,
    trackFrom: user.trackFrom && dateToDay(user.trackFrom),
    names,
    icloudEmail: account?.icloudEmail ?? (fromEnv ? (env.ICLOUD_EMAIL?.trim() ?? "") : ""),
    connected: Boolean(account || (fromEnv && envCredentials(env))),
    fromEnv,
  };
}

/** The sign-in details, or null if there are none. Only the sync and the connection checks call this. */
export function icloudCredentials(
  userId: string,
  user: Pick<UserRow, "isOwner">,
  account: Account | null,
  env: Env = process.env,
): IcloudCredentials | null {
  if (!account) return user.isOwner ? envCredentials(env) : null;
  try {
    return { email: account.icloudEmail, password: decrypt(account.icloudPasswordEnc, account.keyVersion, userId, env) };
  } catch (error) {
    console.error(error);
    throw new Error("The saved iCloud password can't be read. Enter it again under Settings → Calendar.");
  }
}

/** The Calendar form as typed. Every field is text, and the password is never sent back to the browser. */
export type CalendarFields = {
  name: string;
  timeZone: string;
  trackFrom: string;
  icloudEmail: string;
  gigsCalendar: string;
  holdsCalendar: string;
  wantedCalendar: string;
};

export type CalendarValues = Omit<CalendarFields, "trackFrom" | "holdsCalendar"> & {
  trackFrom: Day | null;
  holdsCalendar: string | null;
};

const MAX_NAME = 100;

/** Checks the form. Returns the cleaned values, or what to tell the person. */
export function parseCalendarFields(fields: CalendarFields): { values: CalendarValues } | { error: string } {
  const icloudEmail = fields.icloudEmail.trim();
  const gigsCalendar = fields.gigsCalendar.trim() || "Gigs";
  const holdsCalendar = fields.holdsCalendar.trim() || null;
  const wantedCalendar = fields.wantedCalendar.trim() || "Wanted";
  const trackFrom = fields.trackFrom.trim() || null;
  const timeZone = fields.timeZone.trim();

  if (!looksLikeEmail(icloudEmail) || icloudEmail.length > 254) return { error: "That iCloud email doesn't look right." };
  if (!isTimeZone(timeZone)) return { error: "That isn't a time zone this app knows." };
  if (trackFrom && !isDay(trackFrom)) return { error: "The tracking date should be a real date." };
  if ([gigsCalendar, holdsCalendar ?? "", wantedCalendar].some((name) => name.length > MAX_NAME)) {
    return { error: `Calendar names can be up to ${MAX_NAME} letters.` };
  }
  if (sameName(gigsCalendar, holdsCalendar) || sameName(gigsCalendar, wantedCalendar) || sameName(wantedCalendar, holdsCalendar)) {
    return { error: "Each calendar name has to be different." };
  }
  const name = fields.name.trim().replace(/\s+/g, " ").slice(0, 80);
  return { values: { name, timeZone, trackFrom, icloudEmail, gigsCalendar, holdsCalendar, wantedCalendar } };
}
