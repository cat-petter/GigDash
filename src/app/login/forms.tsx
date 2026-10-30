"use client";

import { type FormEvent, useCallback, useState } from "react";
import { DAILY_CAP_CODE, LINK_LIMIT_CODE } from "@/lib/limit-codes";
import { Turnstile } from "./turnstile";

const FIELD = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const BUTTON = "w-full rounded-full bg-fg py-2 font-medium text-bg disabled:opacity-60";

/** Posts to Better Auth's routes from the browser, so its rate limits apply. */
async function post(path: string, body: object, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function problem(response: Response, otherwise: string): string {
  return response.status === 429 ? "Too many tries. Wait a minute, then try again." : otherwise;
}

/** What to say when a link wasn't sent. The server words its own limits, since only it knows which one. */
async function linkProblem(response: Response): Promise<string> {
  const body: { code?: string; message?: string } = await response.json().catch(() => ({}));
  if (body.message && (body.code === LINK_LIMIT_CODE || body.code === DAILY_CAP_CODE)) return body.message;
  if (response.status === 400 || response.status === 403) return "The bot check didn't pass. Try again.";
  return problem(response, "The email didn't send. Check the address and try again.");
}

function Alert({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-bad">
      {children}
    </p>
  );
}

/**
 * Asks for an email and sends a sign-in link to it. New addresses get an account. `siteKey` is
 * Cloudflare's bot check, null only under `next dev` without one.
 */
export function EmailForm({ next, siteKey }: { next: string; siteKey: string | null }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const checkFailed = useCallback(
    () => setError("The bot check couldn't run. Turn off any content blocker for this site, then reload the page."),
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    try {
      const response = await post(
        "/sign-in/magic-link",
        { email, callbackURL: next },
        token ? { "x-captcha-response": token } : {},
      );
      if (response.ok) setSentTo(email);
      else setError(await linkProblem(response));
    } catch {
      setError("Couldn't reach the app. Check your connection.");
    } finally {
      setPending(false);
      // Used now, whatever the answer was, so the next try needs a new one.
      setToken(null);
      setTokensUsed((used) => used + 1);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          Check <strong>{sentTo}</strong> for a link to sign in. It works once, for 15 minutes.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className="text-accent">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        {/* 16px text, so iPhone doesn't zoom in on the field. */}
        <input type="email" name="email" required autoFocus autoComplete="email" className={FIELD} />
      </label>
      {siteKey && <Turnstile key={tokensUsed} siteKey={siteKey} onToken={setToken} onFailed={checkFailed} />}
      <Alert>{error}</Alert>
      <button type="submit" disabled={pending || (siteKey !== null && !token)} className={BUTTON}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

/** The dashboard password, for the owner until he adds his email. */
export function OwnerPasswordForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    setPending(true);
    setError(null);
    try {
      const response = await post("/sign-in/owner", { password });
      if (response.ok) {
        window.location.assign(next);
        return;
      }
      setError(problem(response, "That password didn't work."));
    } catch {
      setError("Couldn't reach the app. Check your connection.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Dashboard password</span>
        <input type="password" name="password" required autoComplete="current-password" className={FIELD} />
      </label>
      <Alert>{error}</Alert>
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
