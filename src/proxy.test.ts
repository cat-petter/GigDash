import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://gigdash.example${path}`, { headers: cookie ? { cookie } : undefined });
}

const location = (response: Response) => response.headers.get("location");

describe("proxy", () => {
  it("sends visitors without a session cookie to /login, remembering where they were going", () => {
    expect(location(proxy(request("/")))).toBe("https://gigdash.example/login");
    expect(location(proxy(request("/status")))).toBe("https://gigdash.example/login?next=%2Fstatus");
    expect(location(proxy(request("/?person=kaller")))).toBe(
      "https://gigdash.example/login?next=%2F%3Fperson%3Dkaller",
    );
    // The old password cookie, and other apps' cookies, don't count.
    expect(location(proxy(request("/", "gigdash_session=123.abc")))).toBe("https://gigdash.example/login");
    expect(location(proxy(request("/", "better-auth.session_token=abc")))).toBe("https://gigdash.example/login");
  });

  it("lets a visitor with a session cookie through, leaving the real check to the page", () => {
    for (const cookie of ["gigdash.session_token=abc.def", "__Secure-gigdash.session_token=abc.def"]) {
      const response = proxy(request("/status", cookie));
      expect(location(response)).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("always shows the login pages", () => {
    for (const path of ["/login", "/login?next=/status", "/login/confirm?token=abc"]) {
      expect(location(proxy(request(path)))).toBeNull();
      expect(location(proxy(request(path, "gigdash.session_token=stale")))).toBeNull();
    }
  });

  it("shows the privacy page without a session, and nothing that only starts the same", () => {
    expect(location(proxy(request("/privacy")))).toBeNull();
    expect(location(proxy(request("/privacy", "gigdash.session_token=stale")))).toBeNull();
    expect(location(proxy(request("/privacy-export")))).toBe("https://gigdash.example/login?next=%2Fprivacy-export");
    expect(location(proxy(request("/privacy/users")))).toBe("https://gigdash.example/login?next=%2Fprivacy%2Fusers");
  });
});

describe("proxy matcher", () => {
  const matches = (path: string) => config.matcher.some((source) => new RegExp(`^${source}$`).test(path));

  it("covers the pages", () => {
    for (const path of ["/", "/status", "/login", "/login/confirm", "/anything/else"]) {
      expect(matches(path)).toBe(true);
    }
  });

  it("skips the API, build files, icons and the manifest", () => {
    for (const path of [
      "/api/sync",
      "/api/auth/magic-link/verify",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/icon.svg",
      "/apple-icon.png",
      "/icon-512.png",
      "/manifest.webmanifest",
    ]) {
      expect(matches(path)).toBe(false);
    }
  });
});
