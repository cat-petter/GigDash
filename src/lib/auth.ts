import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "gigdash_session";
/** How long a login lasts, in seconds. */
export const SESSION_MAX_AGE = 180 * 24 * 60 * 60;

type Env = Record<string, string | undefined>;
type Secrets = { password: string; secret: string };

function secrets(env: Env = process.env): Secrets | null {
  const password = env.DASHBOARD_PASSWORD;
  const secret = env.CRON_SECRET;
  return password && secret ? { password, secret } : null;
}

/** Why logging in can't work yet, or null if it can. */
export function authProblem(env: Env = process.env): string | null {
  if (!env.DASHBOARD_PASSWORD) return "DASHBOARD_PASSWORD isn't set";
  if (!env.CRON_SECRET) return "CRON_SECRET isn't set";
  return null;
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Compares two strings without leaking, through timing, how much of them matched. */
export function safeEqual(a: string, b: string): boolean {
  // Hashing first makes the lengths equal, which timingSafeEqual needs.
  return timingSafeEqual(hmac("compare", a), hmac("compare", b));
}

// Changing either the password or CRON_SECRET signs everyone out.
function signingKey({ password, secret }: Secrets): Buffer {
  return hmac(secret, `session key\n${password}`);
}

function signature(keys: Secrets, expires: number): string {
  return hmac(signingKey(keys), `session\n${expires}`).toString("base64url");
}

export function checkPassword(attempt: string, env: Env = process.env): boolean {
  const keys = secrets(env);
  return keys !== null && safeEqual(attempt, keys.password);
}

/** A cookie value that proves a login, good for SESSION_MAX_AGE. */
export function createSession(now = Date.now(), env: Env = process.env): string {
  const keys = secrets(env);
  if (!keys) throw new Error(authProblem(env) ?? "Login isn't set up");
  const expires = now + SESSION_MAX_AGE * 1000;
  return `${expires}.${signature(keys, expires)}`;
}

export function isValidSession(
  value: string | undefined,
  now = Date.now(),
  env: Env = process.env,
): boolean {
  const keys = secrets(env);
  if (!keys || !value) return false;
  const match = /^(\d{1,15})\.([\w-]+)$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  return expires > now && safeEqual(match[2], signature(keys, expires));
}

/** Where to go after logging in. Only paths on this site, so a link can't bounce him elsewhere. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  return next;
}
