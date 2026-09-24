import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { config, proxy } from "./proxy";

function request(path: string, { session, method = "GET" }: { session?: string; method?: string } = {}) {
  const headers = session ? { cookie: `${SESSION_COOKIE}=${session}` } : undefined;
  return new NextRequest(`https://gigdash.example${path}`, { method, headers });
}

const location = (response: Response) => response.headers.get("location");

beforeEach(() => {
  vi.stubEnv("DASHBOARD_PASSWORD", "correct horse");
  vi.stubEnv("CRON_SECRET", "s3cret-s3cret-s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("sends visitors without a login to /login, remembering where they were going", () => {
    expect(location(proxy(request("/")))).toBe("https://gigdash.example/login");
    expect(location(proxy(request("/status")))).toBe("https://gigdash.example/login?next=%2Fstatus");
    expect(location(proxy(request("/?person=kaller")))).toBe(
      "https://gigdash.example/login?next=%2F%3Fperson%3Dkaller",
    );
  });

  it("turns away a forged or expired cookie", () => {
    expect(location(proxy(request("/", { session: "4102444800000.forged" })))).toBe("https://gigdash.example/login");
    const expired = createSession(Date.now() - 181 * 24 * 60 * 60 * 1000);
    expect(location(proxy(request("/", { session: expired })))).toBe("https://gigdash.example/login");
  });

  it("lets a logged-in visitor through", () => {
    const response = proxy(request("/status", { session: createSession() }));
    expect(location(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("shows the login page, or skips it when already logged in", () => {
    expect(location(proxy(request("/login")))).toBeNull();
    const session = createSession();
    expect(location(proxy(request("/login?next=/status", { session })))).toBe("https://gigdash.example/status");
    expect(location(proxy(request("/login?next=//evil.example", { session })))).toBe("https://gigdash.example/");
    // The login form posts back to /login; that must reach the page even with a cookie.
    expect(location(proxy(request("/login", { session, method: "POST" })))).toBeNull();
  });

  it("locks everything out when login isn't set up", () => {
    const session = createSession();
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect(location(proxy(request("/", { session })))).toBe("https://gigdash.example/login");
  });
});

describe("proxy matcher", () => {
  const matches = (path: string) => config.matcher.some((source) => new RegExp(`^${source}$`).test(path));

  it("covers the pages", () => {
    for (const path of ["/", "/status", "/login", "/anything/else"]) expect(matches(path)).toBe(true);
  });

  it("skips the API, build files, icons and the manifest", () => {
    for (const path of [
      "/api/sync",
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
