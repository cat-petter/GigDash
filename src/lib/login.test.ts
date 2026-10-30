import { describe, expect, it } from "vitest";
import {
  authBaseURL,
  authProblem,
  authSecret,
  checkOwnerPassword,
  looksLikeEmail,
  safeEqual,
  safeNext,
  trustedOrigins,
  turnstileProblem,
  usesTurnstile,
} from "./login";

describe("Turnstile settings", () => {
  const both = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };

  it("is required on a deployment, even with no keys", () => {
    expect(usesTurnstile({ NODE_ENV: "production" })).toBe(true);
    expect(usesTurnstile({})).toBe(true);
    expect(turnstileProblem({ NODE_ENV: "production" })).toMatch(/TURNSTILE/);
    expect(turnstileProblem({ NODE_ENV: "production", TURNSTILE_SITE_KEY: "site" })).toMatch(/TURNSTILE/);
    expect(turnstileProblem({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" })).toMatch(/TURNSTILE/);
    expect(turnstileProblem({ NODE_ENV: "production", ...both })).toBeNull();
  });

  it("can be left out under next dev, but not half set up", () => {
    expect(usesTurnstile({ NODE_ENV: "development" })).toBe(false);
    expect(turnstileProblem({ NODE_ENV: "development" })).toBeNull();
    expect(usesTurnstile({ NODE_ENV: "development", ...both })).toBe(true);
    expect(turnstileProblem({ NODE_ENV: "development", TURNSTILE_SECRET_KEY: "secret" })).toMatch(/TURNSTILE/);
  });
});

describe("checkOwnerPassword", () => {
  const env = { DASHBOARD_PASSWORD: "correct horse" };

  it("accepts only the dashboard password", () => {
    expect(checkOwnerPassword("correct horse", env)).toBe(true);
    expect(checkOwnerPassword("correct hors", env)).toBe(false);
    expect(checkOwnerPassword("", env)).toBe(false);
  });

  it("rejects everything when no password is set", () => {
    expect(checkOwnerPassword("", {})).toBe(false);
    expect(checkOwnerPassword("undefined", {})).toBe(false);
    expect(checkOwnerPassword("", { DASHBOARD_PASSWORD: "" })).toBe(false);
  });
});

describe("authSecret", () => {
  it("prefers BETTER_AUTH_SECRET", () => {
    expect(authSecret({ BETTER_AUTH_SECRET: "a", CRON_SECRET: "b" })).toBe("a");
  });

  it("falls back to a key made from CRON_SECRET, not CRON_SECRET itself", () => {
    const secret = authSecret({ CRON_SECRET: "s3cret-s3cret-s3cret" });
    expect(secret).toMatch(/^[\w-]{43}$/);
    expect(secret).not.toContain("s3cret");
    expect(authSecret({ CRON_SECRET: "s3cret-s3cret-s3cret" })).toBe(secret);
    expect(authSecret({ CRON_SECRET: "other" })).not.toBe(secret);
  });

  it("is missing when neither is set", () => {
    expect(authSecret({})).toBeUndefined();
    expect(authProblem({})).toBe("BETTER_AUTH_SECRET isn't set");
    expect(authProblem({ CRON_SECRET: "x" })).toBeNull();
  });
});

describe("authBaseURL", () => {
  it("uses BETTER_AUTH_URL when it's set", () => {
    expect(authBaseURL({ BETTER_AUTH_URL: "http://localhost:3100", VERCEL_URL: "x.vercel.app" })).toBe(
      "http://localhost:3100",
    );
  });

  it("uses the production domain in production, and the branch address in previews", () => {
    const vercel = {
      VERCEL_PROJECT_PRODUCTION_URL: "gigs.example",
      VERCEL_BRANCH_URL: "gigs-git-multi-account.vercel.app",
      VERCEL_URL: "gigs-abc123.vercel.app",
    };
    expect(authBaseURL({ ...vercel, VERCEL_ENV: "production" })).toBe("https://gigs.example");
    expect(authBaseURL({ ...vercel, VERCEL_ENV: "preview" })).toBe("https://gigs-git-multi-account.vercel.app");
    expect(authBaseURL({ VERCEL_ENV: "preview", VERCEL_URL: "gigs-abc123.vercel.app" })).toBe(
      "https://gigs-abc123.vercel.app",
    );
    expect(trustedOrigins({ ...vercel, VERCEL_ENV: "preview" })).toEqual([
      "https://gigs-git-multi-account.vercel.app",
      "https://gigs.example",
      "https://gigs-abc123.vercel.app",
    ]);
  });

  it("falls back to localhost", () => {
    expect(authBaseURL({})).toBe("http://localhost:3000");
    expect(trustedOrigins({})).toEqual(["http://localhost:3000"]);
  });
});

describe("looksLikeEmail", () => {
  it("catches typos, not every invalid address", () => {
    expect(looksLikeEmail("someone@example.com")).toBe(true);
    for (const typo of ["someone", "someone@example", "some one@example.com", "@example.com", ""]) {
      expect(looksLikeEmail(typo)).toBe(false);
    }
  });
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/status")).toBe("/status");
    expect(safeNext("/?person=kaller&range=all")).toBe("/?person=kaller&range=all");
  });

  it("drops anything that could leave the site", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "status", "", null, undefined, 5]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});
