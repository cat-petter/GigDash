"use client";

import { useActionState } from "react";
import { type DeleteAccountState, deleteOwnAccount } from "@/app/account-actions";

/** Settings → Account. Closed until asked for, and it needs the email typed out. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteOwnAccount, { error: null });

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-bad">Delete my account…</summary>
      <form action={action} className="mt-3 space-y-3">
        <p>
          This erases your saved iCloud password, gigs, names, rules and sync history straight away. It can&apos;t be
          undone. The calendars themselves aren&apos;t touched.
        </p>
        <p>
          It can&apos;t revoke the app-specific password itself, so delete that at{" "}
          <a href="https://account.apple.com" target="_blank" rel="noreferrer" className="text-accent">
            account.apple.com
          </a>{" "}
          under Sign-In and Security.
        </p>
        <label className="block space-y-1">
          <span className="font-medium">Type your email to confirm</span>
          {/* 16px text, so iPhone doesn't zoom in on the field. */}
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-bad">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-bad px-4 py-1.5 font-medium text-bad disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </form>
    </details>
  );
}
