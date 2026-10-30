"use client";

import { useActionState } from "react";
import { type AddEmailState, addEmail } from "@/app/account-actions";

/** The owner's one-time step from the dashboard password to signing in by email. */
export function AddEmailForm() {
  const [state, action, pending] = useActionState<AddEmailState, FormData>(addEmail, { error: null, sentTo: null });

  if (state.sentTo) {
    return (
      <p className="text-sm">
        Check <strong>{state.sentTo}</strong> for a link to confirm it. It works for 15 minutes. If it doesn&apos;t
        arrive, look in spam, or that address may already have an account.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        {/* 16px text, so iPhone doesn't zoom in on the field. */}
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Your email"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send link"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
