import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { COOKIE_PREFIX } from "@/lib/login";

/**
 * Every page needs a login, except the login pages and the privacy page. This only checks that there's
 * a session cookie, so signed-out visitors go straight to /login; each page checks the session is real
 * (src/lib/dal.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/privacy") return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/" || search) login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Skipped: /api (each route checks its own login or the cron secret), Next's build files, and the
    // icons and manifest, which the phone fetches without the login cookie.
    "/((?!api/|_next/static|_next/image|.*\\.(?:png|svg|ico|webmanifest)$).*)",
  ],
};
