import { type NextRequest, NextResponse } from "next/server";
import { isValidSession, safeNext, SESSION_COOKIE } from "@/lib/auth";

/** Every page needs a login, except the login page itself. */
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const loggedIn = isValidSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    // Someone already logged in skips the form. Only for page loads: the form itself posts here.
    if (loggedIn && request.method === "GET") {
      return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url));
    }
    return NextResponse.next();
  }
  if (loggedIn) return NextResponse.next();

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
