import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, type SessionUser } from "./auth";

/**
 * The signed-in user, or null. Checked against the sessions table once per request. This is the one
 * place pages and actions learn who is asking; a user id never comes from the request itself.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/**
 * Sends anyone who isn't signed in to /login, and returns who is. The proxy only checks that a
 * session cookie is there; this checks that it's real.
 */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Whether this user's calendar is the one in the iCloud env vars. Only the owner's is, until each
 * account stores its own. Anyone else syncing would copy the owner's gigs into their account.
 */
export function usesEnvCalendar(user: SessionUser): boolean {
  return user.isOwner === true;
}
