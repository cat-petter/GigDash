import { describe, expect, it } from "vitest";
import { normalizeKey, parseTitle } from "./parse-title";

describe("parseTitle", () => {
  describe("his real titles", () => {
    it("parses person, keyword, price and a two-word location", () => {
      expect(parseTitle("Kaller job 600 neemas hachaim")).toEqual({
        ok: true,
        keyword: "job",
        person: "Kaller",
        personKey: "kaller",
        price: 600,
        location: "neemas hachaim",
        locationKey: "neemas hachaim",
      });
    });

    it("parses a bare hold", () => {
      expect(parseTitle("Kaller hold")).toEqual({
        ok: true,
        keyword: "hold",
        person: "Kaller",
        personKey: "kaller",
        price: null,
        location: null,
        locationKey: null,
      });
    });

    it("parses a two-word lowercase name with a location but no price", () => {
      expect(parseTitle("Yitsy korblue job brooklyn")).toEqual({
        ok: true,
        keyword: "job",
        person: "Yitsy korblue",
        personKey: "yitsy korblue",
        price: null,
        location: "brooklyn",
        locationKey: "brooklyn",
      });
    });
  });

  describe("keyword", () => {
    it.each([
      ["Kaller JOB", "job"],
      ["Kaller Hold", "hold"],
      ["Kaller on hold", "hold"],
      ["Kaller On Hold 500 brooklyn", "hold"],
    ])("reads %j as %s", (title, keyword) => {
      expect(parseTitle(title)).toMatchObject({ ok: true, keyword, person: "Kaller" });
    });

    it('keeps "on hold" out of the person and still reads price and location', () => {
      expect(parseTitle("Yitsy korblue on hold 1,200 boro park")).toMatchObject({
        person: "Yitsy korblue",
        price: 1200,
        location: "boro park",
      });
    });

    it("only matches the whole word", () => {
      expect(parseTitle("Holden job")).toMatchObject({ ok: true, keyword: "job", person: "Holden" });
      expect(parseTitle("Jobby hold")).toMatchObject({ ok: true, keyword: "hold", person: "Jobby" });
    });

    it("uses the first keyword when there are several", () => {
      expect(parseTitle("Kaller hold job brooklyn")).toMatchObject({
        keyword: "hold",
        location: "job brooklyn",
      });
    });
  });

  describe("price", () => {
    it.each([
      ["600", 600],
      ["$600", 600],
      ["1,200", 1200],
      ["$1,200", 1200],
      ["12,500", 12500],
      ["1.5k", 1500],
      ["2K", 2000],
      ["$1.25k", 1250],
      ["450.00", 450],
    ])("reads %s as %d", (token, price) => {
      expect(parseTitle(`Kaller job ${token} brooklyn`)).toMatchObject({
        price,
        location: "brooklyn",
      });
    });

    it.each(["1,20", "$", "six hundred", "600$"])(
      "treats %j as the start of the location, not a price",
      (token) => {
        expect(parseTitle(`Kaller job ${token}`)).toMatchObject({ price: null, location: token });
      },
    );

    it("only looks at the token right after the keyword", () => {
      expect(parseTitle("Kaller job brooklyn 600")).toMatchObject({
        price: null,
        location: "brooklyn 600",
      });
    });

    it("reads a price with no location", () => {
      expect(parseTitle("Kaller job 600")).toMatchObject({ price: 600, location: null });
    });
  });

  it("collapses extra whitespace", () => {
    expect(parseTitle("  Yitsy   korblue  job \t 600   neemas   hachaim ")).toMatchObject({
      person: "Yitsy korblue",
      price: 600,
      location: "neemas hachaim",
    });
  });

  it("keeps the display case but lowercases the keys", () => {
    expect(parseTitle("KALLER job 600 Neemas Hachaim")).toMatchObject({
      person: "KALLER",
      personKey: "kaller",
      location: "Neemas Hachaim",
      locationKey: "neemas hachaim",
    });
  });

  describe("errors", () => {
    it.each([
      ["", "The title is empty"],
      ["   ", "The title is empty"],
      ["Kaller 600 neemas hachaim", 'No "job" or "hold" in the title'],
      ["Kaller jobs", 'No "job" or "hold" in the title'],
      ["job 600 brooklyn", 'No name before "job"'],
      ["hold", 'No name before "hold"'],
      ["on hold", 'No name before "on hold"'],
    ])("rejects %j", (title, error) => {
      expect(parseTitle(title)).toEqual({ ok: false, error });
    });
  });
});

describe("normalizeKey", () => {
  it("groups names that differ only by case and spacing", () => {
    expect(normalizeKey("Kaller")).toBe(normalizeKey("kaller"));
    expect(normalizeKey(" Yitsy  Korblue ")).toBe("yitsy korblue");
  });

  it("does not merge typos", () => {
    expect(normalizeKey("Kallr")).not.toBe(normalizeKey("Kaller"));
  });
});
