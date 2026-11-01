// The rules for the account screens, kept apart from the database so they're easy to test.
// The database side is in accounts-store.ts.

const SYSTEMS: [RegExp, string][] = [
  // In this order: an iPhone's browser also says "like Mac OS X", and Android's says "Linux".
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux|X11/, "Linux"],
];

const BROWSERS: [RegExp, string][] = [
  // In this order: Edge and Chrome also say "Chrome" and "Safari", and Chrome on iPhone says "Safari".
  [/EdgA?\/|EdgiOS/, "Edge"],
  [/OPR\/|OPiOS/, "Opera"],
  [/FxiOS|Firefox/, "Firefox"],
  [/CriOS|Chrome/, "Chrome"],
  [/Safari/, "Safari"],
];

/** "iPhone · Safari". A Home Screen app on iPhone doesn't name a browser, so that's just "iPhone". */
export function deviceName(userAgent: string | null): string {
  const named = (list: [RegExp, string][]) => list.find(([pattern]) => pattern.test(userAgent ?? ""))?.[1];
  const system = named(SYSTEMS);
  if (!system) return "Unknown device";
  const browser = named(BROWSERS);
  return browser ? `${system} · ${browser}` : system;
}

/** Deleting your own account needs your email typed out, so a stray tap can't do it. */
export function confirmsDeletion(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.toLowerCase();
}

/**
 * The owner's account can't be deleted from the app: it runs the deployment, and without it nobody
 * could see the list of users or remove anyone.
 */
export function selfDeletionProblem(user: { isOwner?: boolean | null }): string | null {
  return user.isOwner ? "The owner's account can't be deleted here." : null;
}

/** Why this person can't remove that user, or null if they can. */
export function removalProblem(asker: { id: string; isOwner?: boolean | null }, targetId: unknown): string | null {
  if (!asker.isOwner) return "Only the owner can remove users.";
  if (typeof targetId !== "string" || !targetId) return "That user wasn't found.";
  if (targetId === asker.id) return "You can't remove your own account.";
  return null;
}

/**
 * Which stored sign-in links were sent to this address. Better Auth keeps the address as JSON in
 * `value`. Unused, one of these would make the account again after it's deleted.
 */
export function linksTo(rows: { id: string; value: string }[], email: string): string[] {
  const address = email.toLowerCase();
  return rows.filter((row) => linkAddress(row.value) === address).map((row) => row.id);
}

function linkAddress(value: string): string | null {
  try {
    const { email } = JSON.parse(value);
    return typeof email === "string" ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Someone who has connected nothing and has no gigs sees the welcome screen instead of an empty dashboard. */
export function isFirstRun({ connected, gigs, tab }: { connected: boolean; gigs: number; tab: string }): boolean {
  return !connected && gigs === 0 && tab !== "settings";
}
