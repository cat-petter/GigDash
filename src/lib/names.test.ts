import { describe, expect, it } from "vitest";
import {
  countSpellings,
  DEFAULT_RULES,
  displayText,
  groupNames,
  matchKey,
  oneLetterApart,
  parseWordList,
  type MatchRules,
  type Spelling,
} from "./names";

const people = DEFAULT_RULES.person;
const places = DEFAULT_RULES.place;
const none: MatchRules = {
  punctuation: false,
  wordOrder: false,
  doubleLetters: false,
  soundAlike: false,
  oneLetterOff: false,
  ignoreWords: [],
};

const same = (a: string, b: string, rules = people) => matchKey(a, rules) === matchKey(b, rules);

function spelling(key: string, count = 1, text = key, latest = "2026-11-01"): Spelling {
  return { key, text, count, latest };
}

describe("matchKey", () => {
  it("matches the spellings each rule is for", () => {
    expect(same("kaller", "kaler")).toBe(true);
    expect(same("friedman", "fridman")).toBe(true);
    expect(same("friedman", "freedman")).toBe(true);
    expect(same("schwartz", "shwarz")).toBe(true);
    expect(same("schwartz", "shvartz")).toBe(true);
    expect(same("cohen", "kohen")).toBe(true);
    expect(same("weiss", "veiss")).toBe(true);
    expect(same("moshe", "moishe")).toBe(true);
    expect(same("yitsy korblue", "yitzy korblue")).toBe(true);
    expect(same("chaim kaller", "kaller chaim")).toBe(true);
    expect(same("mr. kaller", "kaller")).toBe(true);
    expect(same("r' kaller", "kaller")).toBe(true);
    expect(same("boro park", "boropark", places)).toBe(true);
    expect(same("neemas hachaim", "neimas hachaim", places)).toBe(true);
    expect(same("the terrace", "terrace", places)).toBe(true);
  });

  it("matches the examples Settings shows for each rule", () => {
    expect(same("yitsy-korblue", "yitsy korblue")).toBe(true);
    expect(same("halpern", "halpren")).toBe(false);
    expect(oneLetterApart(matchKey("halpern", people), matchKey("halpren", people))).toBe(true);
    expect(same("palace eden", "eden palace", { ...places, wordOrder: true })).toBe(true);
    expect(same("williamsburg", "wiliamsburg", places)).toBe(true);
    expect(same("lakewood", "lakewod", places)).toBe(true);
  });

  it("keeps different names apart", () => {
    expect(same("katz", "kaller")).toBe(false);
    expect(same("klein", "kalan")).toBe(false);
    expect(same("stern", "sterns")).toBe(false);
    expect(same("yankel", "lankel")).toBe(false);
  });

  it("does only what the rules turned on allow", () => {
    expect(same("kaller", "kaler", none)).toBe(false);
    expect(same("Kaller", "kaller", none)).toBe(true);
    expect(same("chaim kaller", "kaller chaim", { ...people, wordOrder: false })).toBe(false);
    expect(same("friedman", "fridman", { ...people, soundAlike: false })).toBe(false);
    expect(same("mr kaller", "kaller", { ...people, ignoreWords: [] })).toBe(false);
  });

  it("drops multi-word phrases and keeps a name made only of ignored words", () => {
    const rules = { ...people, ignoreWords: ["bar mitzvah"] };
    expect(same("stern bar mitzvah", "stern", rules)).toBe(true);
    expect(matchKey("the", places)).not.toBe("");
  });
});

describe("oneLetterApart", () => {
  it("allows one change in names of five or more letters, starting the same", () => {
    expect(oneLetterApart("rosen", "rozen")).toBe(true);
    expect(oneLetterApart("goldstein", "goldstien")).toBe(true);
    expect(oneLetterApart("goldstein", "goldsten")).toBe(true);
    expect(oneLetterApart("goldsten", "goldstein")).toBe(true);
    expect(oneLetterApart("katz", "kats")).toBe(false);
    expect(oneLetterApart("rosen", "bosen")).toBe(false);
    expect(oneLetterApart("rosen", "rosen")).toBe(false);
    expect(oneLetterApart("goldstein", "goldsteinn1")).toBe(false);
    expect(oneLetterApart("abcdef", "abdcfe")).toBe(false);
  });
});

describe("groupNames", () => {
  it("puts matching spellings together, named after the one used most", () => {
    const names = groupNames(
      [spelling("kaller", 10, "Kaller"), spelling("kaler", 2, "kaler"), spelling("katz", 4, "Katz")],
      [],
      people,
    );
    expect(names.groups.map((group) => [group.id, group.label, group.count])).toEqual([
      ["kaller", "Kaller", 12],
      ["katz", "Katz", 4],
    ]);
    expect(names.byKey.get("kaler")?.id).toBe("kaller");
  });

  it("chains spellings that are one letter apart", () => {
    const names = groupNames([spelling("goldstein", 3), spelling("goldsten", 1), spelling("goldsteen", 1)], [], people);
    expect(names.groups).toHaveLength(1);
  });

  it("keeps pinned spellings with their saved name, and new matches join it", () => {
    const names = groupNames(
      [spelling("kaller", 10), spelling("kaler", 2), spelling("chaim", 3), spelling("kallar", 1)],
      [
        { id: "a", label: "Chaim Kaller", keys: ["kaller", "chaim"] },
        { id: "b", label: null, keys: ["kaler"] },
      ],
      people,
    );
    const a = names.groups.find((group) => group.id === "a")!;
    expect(a.label).toBe("Chaim Kaller");
    expect(a.named).toBe(true);
    expect(a.spellings.map((s) => [s.key, s.pinned])).toEqual([
      ["kaller", true],
      ["chaim", true],
      ["kallar", false],
    ]);
    const b = names.groups.find((group) => group.id === "b")!;
    expect(b.label).toBe("Kaler");
    expect(b.named).toBe(false);
  });

  it("leaves out saved names with no spellings left", () => {
    const names = groupNames([spelling("katz")], [{ id: "gone", label: "Old", keys: ["old"] }], people);
    expect(names.groups.map((group) => group.id)).toEqual(["katz"]);
  });
});

describe("helpers", () => {
  it("capitalizes all-lowercase spellings only", () => {
    expect(displayText("neemas hachaim")).toBe("Neemas Hachaim");
    expect(displayText("r' kaller")).toBe("R' Kaller");
    expect(displayText("McDonald hall")).toBe("McDonald hall");
  });

  it("reads a word list", () => {
    expect(parseWordList("Mr, the ,  Rabbi,,mr\nbar  mitzvah")).toEqual(["mr", "the", "rabbi", "bar mitzvah"]);
  });

  it("counts spellings, leaving deleted gigs out of the count", () => {
    expect(
      countSpellings([
        { key: "kaller", text: "Kaller", gigDate: "2026-11-01", deleted: false },
        { key: "kaller", text: "kaller", gigDate: "2026-11-03", deleted: false },
        { key: "kaller", text: "Kaller", gigDate: "2026-11-05", deleted: true },
        { key: null, text: null, gigDate: "2026-11-05", deleted: false },
      ]),
    ).toEqual([{ key: "kaller", text: "Kaller", count: 2, latest: "2026-11-05" }]);
  });
});
