import { describe, expect, it } from "vitest";
import { buildLexicon, normalizeKey, parseTitle } from "./parse-title";

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
      expect(parseTitle("Kaller hold job brooklyn")).toMatchObject({ keyword: "hold", location: "brooklyn" });
    });

    it("is optional", () => {
      expect(parseTitle("Kaller 600 brooklyn")).toMatchObject({
        ok: true,
        keyword: null,
        person: "Kaller",
        price: 600,
        location: "brooklyn",
      });
      expect(parseTitle("Kaller jobs")).toMatchObject({ keyword: null, person: "Kaller jobs" });
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

    it("reads a trailing dollar sign", () => {
      expect(parseTitle("Kaller job 600$")).toMatchObject({ price: 600, location: null });
    });

    it.each(["1,20", "$", "six hundred"])(
      "treats %j as the start of the location, not a price",
      (token) => {
        expect(parseTitle(`Kaller job ${token}`)).toMatchObject({ price: null, location: token });
      },
    );

    it("finds the price anywhere", () => {
      expect(parseTitle("Kaller job brooklyn 600")).toMatchObject({ price: 600, location: "brooklyn" });
      expect(parseTitle("600 Kaller, brooklyn")).toMatchObject({ price: 600, person: "Kaller", location: "brooklyn" });
    });

    it("prefers a price written with $ or k over a bare number", () => {
      expect(parseTitle("Kaller 770 $600")).toMatchObject({ price: 600 });
      expect(parseTitle("Kaller 18 1.5k")).toMatchObject({ price: 1500 });
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
      ["job 600", "No name in the title"],
      ["hold", "No name in the title"],
      ["on hold", "No name in the title"],
      ["$600 at brooklyn", "No name in the title"],
    ])("rejects %j", (title, error) => {
      expect(parseTitle(title)).toEqual({ ok: false, error });
    });
  });
});

describe("any order", () => {
  it("reads a location after at or @", () => {
    expect(parseTitle("at boro park, Kaller 600")).toMatchObject({ person: "Kaller", price: 600, location: "boro park" });
    expect(parseTitle("Kaller @brooklyn $600")).toMatchObject({ person: "Kaller", price: 600, location: "brooklyn" });
  });

  it("splits parts on commas and dashes", () => {
    expect(parseTitle("Kaller, neemas hachaim, $1,200")).toMatchObject({
      person: "Kaller",
      price: 1200,
      location: "neemas hachaim",
    });
    expect(parseTitle("Yitsy korblue - boro park - 600")).toMatchObject({
      person: "Yitsy korblue",
      location: "boro park",
    });
  });

  it("guesses the first part is the person when it knows neither part", () => {
    expect(parseTitle("Shmuli 500 Ateres Chynka")).toMatchObject({ person: "Shmuli", location: "Ateres Chynka" });
  });

  describe("with names and places learned from his other titles", () => {
    const lexicon = buildLexicon([
      "Kaller job 600 neemas hachaim",
      "Yitsy korblue job brooklyn",
      "Shmuli 500 at Ateres Chynka",
      "Moshe at boro park",
    ]);

    it.each([
      ["neemas hachaim 600 Kaller", "Kaller", "neemas hachaim"],
      ["neemas hachaim Kaller 600", "Kaller", "neemas hachaim"],
      ["600 brooklyn yitsy korblue", "yitsy korblue", "brooklyn"],
      ["Ateres Chynka Shmuli", "Shmuli", "Ateres Chynka"],
      ["boro park kaller job", "kaller", "boro park"],
    ])("reads %j", (title, person, location) => {
      expect(parseTitle(title, lexicon)).toMatchObject({ ok: true, person, location });
    });

    it("learns the other part of a two-part title from the part it knows", () => {
      const learned = buildLexicon(["Kaller job brooklyn", "Lakewood 500 Kaller"]);
      expect(parseTitle("Dovid Lakewood", learned)).toMatchObject({ person: "Dovid", location: "Lakewood" });
    });

    it("learns name then place from a comma", () => {
      const learned = buildLexicon(["Shmuli 500, john street"]);
      expect(parseTitle("John street shmuli 500", learned)).toMatchObject({
        person: "shmuli",
        price: 500,
        location: "John street",
      });
    });

    it("doesn't learn from a comma when a part is already known", () => {
      const learned = buildLexicon(["Kaller job brooklyn", "brooklyn, Moshe"]);
      expect(parseTitle("Moshe Lakewood", learned)).toMatchObject({ person: "Moshe", location: "Lakewood" });
      expect(parseTitle("brooklyn Kaller", learned)).toMatchObject({ person: "Kaller", location: "brooklyn" });
    });

    it.each([
      "Shmuli 500, john street",
      "John street shmuli 500",
      "500 shmuli at john street",
    ])("reads %j the same once it has seen the others", (title) => {
      const learned = buildLexicon(["Shmuli 500, john street", "John street shmuli 500", "500 shmuli at john street"]);
      expect(parseTitle(title, learned)).toMatchObject({ personKey: "shmuli", price: 500, locationKey: "john street" });
    });

    it("flags a title that is only a known place", () => {
      expect(parseTitle("brooklyn 600", lexicon)).toEqual({ ok: false, error: "No name in the title" });
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

describe("wanted keyword", () => {
  it("reads 'wanted' like job and hold", () => {
    expect(parseTitle("Kaller wanted 800 boro park")).toMatchObject({
      ok: true,
      keyword: "wanted",
      person: "Kaller",
      price: 800,
      location: "boro park",
    });
  });
});
