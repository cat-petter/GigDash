"use client";

import { useState, useTransition } from "react";
import { removeUser } from "@/app/account-actions";

/** Two taps: the first asks, naming who, and the second removes. */
export function RemoveUserButton({ userId, email }: { userId: string; email: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  function remove() {
    startRemoving(async () => setError((await removeUser(userId)).error));
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="shrink-0 text-sm text-bad">
        Remove
      </button>
    );
  }

  return (
    <div className="max-w-[60%] shrink-0 space-y-2 text-right text-sm">
      <p className="break-words">Delete {email} and all their data?</p>
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => setAsking(false)} disabled={removing} className="text-muted disabled:opacity-60">
          Cancel
        </button>
        <button type="button" onClick={remove} disabled={removing} className="font-medium text-bad disabled:opacity-60">
          {removing ? "Removing…" : "Yes, remove"}
        </button>
      </div>
    </div>
  );
}
