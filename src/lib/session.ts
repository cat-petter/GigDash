import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "./auth";

/**
 * Sends anyone who isn't logged in to /login. The proxy already does this for every page;
 * checking again here means a page stays private even if the proxy's matcher changes.
 */
export async function requireLogin(next: string): Promise<void> {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  }
}
