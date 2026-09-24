import { describe, expect, it } from "vitest";
import { authProblem, checkPassword, createSession, isValidSession, safeEqual, safeNext, SESSION_MAX_AGE } from "./auth";

const env = { DASHBOARD_PASSWORD: "correct horse", CRON_SECRET: "s3cret-s3cret-s3cret" };
const now = Date.UTC(2026, 8, 24);

describe("checkPassword", () => {
  it("accepts only the dashboard password", () => {
    expect(checkPassword("correct horse", env)).toBe(true);
    expect(checkPassword("correct hors", env)).toBe(false);
    expect(checkPassword("", env)).toBe(false);
  });

  it("rejects everything when no password is set", () => {
    expect(checkPassword("", { CRON_SECRET: "x" })).toBe(false);
    expect(checkPassword("undefined", { CRON_SECRET: "x" })).toBe(false);
  });
});

describe("sessions", () => {
  it("accepts a fresh session until it expires", () => {
    const session = createSession(now, env);
    expect(isValidSession(session, now, env)).toBe(true);
    expect(isValidSession(session, now + (SESSION_MAX_AGE - 60) * 1000, env)).toBe(true);
    expect(isValidSession(session, now + SESSION_MAX_AGE * 1000, env)).toBe(false);
  });

  it("rejects a session with a changed expiry", () => {
    const [, signature] = createSession(now, env).split(".");
    const later = now + SESSION_MAX_AGE * 2000;
    expect(isValidSession(`${later}.${signature}`, now, env)).toBe(false);
  });

  it("signs everyone out when the password or CRON_SECRET changes", () => {
    const session = createSession(now, env);
    expect(isValidSession(session, now, { ...env, DASHBOARD_PASSWORD: "new password" })).toBe(false);
    expect(isValidSession(session, now, { ...env, CRON_SECRET: "new secret" })).toBe(false);
  });

  it("rejects missing and malformed cookies", () => {
    for (const value of [undefined, "", "abc", "123", "123.", ".abc", "1e3.abc", "123.abc.def"]) {
      expect(isValidSession(value, now, env)).toBe(false);
    }
  });

  it("refuses to make a session when login isn't set up", () => {
    expect(() => createSession(now, { CRON_SECRET: "x" })).toThrow("DASHBOARD_PASSWORD isn't set");
    expect(isValidSession("123.abc", now, {})).toBe(false);
  });
});

describe("authProblem", () => {
  it("names the missing setting", () => {
    expect(authProblem({})).toBe("DASHBOARD_PASSWORD isn't set");
    expect(authProblem({ DASHBOARD_PASSWORD: "x" })).toBe("CRON_SECRET isn't set");
    expect(authProblem(env)).toBeNull();
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
