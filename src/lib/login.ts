import { createHmac, timingSafeEqual } from "node:crypto";

// The pieces of logging in that don't need the database, kept apart so they're easy to test.

type Env = Record<string, string | undefined>;

/** The session cookie is "gigdash.session_token" ("__Secure-…" over https). */
export const COOKIE_PREFIX = "gigdash";

/** How long a sign-in link works, in seconds. */
export const LINK_LIFETIME = 15 * 60;

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Compares two strings without leaking, through timing, how much of them matched. */
export function safeEqual(a: string, b: string): boolean {
  // Hashing first makes the lengths equal, which timingSafeEqual needs.
  return timingSafeEqual(hmac("compare", a), hmac("compare", b));
}

/**
 * The key Better Auth signs cookies and links with. Falls back to one made from CRON_SECRET, so a
 * deployment that hasn't had BETTER_AUTH_SECRET added yet still works.
 */
export function authSecret(env: Env = process.env): string | undefined {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.CRON_SECRET) return hmac(env.CRON_SECRET, "better-auth secret").toString("base64url");
  return undefined;
}

/** Why logging in can't work yet, or null if it can. */
export function authProblem(env: Env = process.env): string | null {
  if (!authSecret(env)) return "BETTER_AUTH_SECRET isn't set";
  return null;
}

/**
 * Whether sign-in links need Cloudflare's bot check. Always, except under `next dev` with no key, so
 * links can be tried locally. A deployment missing its keys refuses links instead of skipping the check.
 */
export function usesTurnstile(env: Env = process.env): boolean {
  return env.NODE_ENV !== "development" || Boolean(env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SITE_KEY);
}

/** Why sign-in links can't be sent yet, or null if they can. */
export function turnstileProblem(env: Env = process.env): string | null {
  if (!usesTurnstile(env) || (env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY)) return null;
  return "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both needed";
}

/** The address this deployment is reached at, which sign-in links point to. */
export function authBaseURL(env: Env = process.env): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  const host = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/** Every address this deployment answers on. A preview has its branch address and its own. */
export function trustedOrigins(env: Env = process.env): string[] {
  const hosts = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL].filter(Boolean);
  return [...new Set([new URL(authBaseURL(env)).origin, ...hosts.map((host) => `https://${host}`)])];
}

/** The owner's password login, which only works until he adds his email. */
export function checkOwnerPassword(attempt: string, env: Env = process.env): boolean {
  const password = env.DASHBOARD_PASSWORD;
  return Boolean(password) && safeEqual(attempt, password!);
}

/** Where to go after logging in. Only paths on this site, so a link can't bounce him elsewhere. */
export function safeNext(next: unknown): string {
  // Browsers drop tabs and newlines from a URL and read a backslash as a slash, so "/<tab>/evil.example" leaves the site.
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\p{Cc}]/u.test(next)) {
    return "/";
  }
  const here = "https://here.invalid";
  return new URL(next, here).origin === here ? next : "/";
}

/** A loose check, enough to catch typos. The sign-in link proves the address works. */
export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
