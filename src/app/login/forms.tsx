"use client";

import { type FormEvent, useState } from "react";

const FIELD = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const BUTTON = "w-full rounded-full bg-fg py-2 font-medium text-bg disabled:opacity-60";

/** Posts to Better Auth's routes from the browser, so its rate limits apply. */
async function post(path: string, body: object): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function problem(response: Response, otherwise: string): string {
  return response.status === 429 ? "Too many tries. Wait a minute, then try again." : otherwise;
}

function Alert({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-bad">
      {children}
    </p>
  );
}

/** Asks for an email and sends a sign-in link to it. New addresses get an account. */
export function EmailForm({ next }: { next: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    try {
      const response = await post("/sign-in/magic-link", { email, callbackURL: next });
      if (response.ok) setSentTo(email);
      else setError(problem(response, "The email didn't send. Check the address and try again."));
    } catch {
      setError("Couldn't reach the app. Check your connection.");
    } finally {
      setPending(false);
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
      <Alert>{error}</Alert>
      <button type="submit" disabled={pending} className={BUTTON}>
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
