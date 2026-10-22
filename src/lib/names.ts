/**
 * People and places. A title's spelling ("Kaler", "kaller", "Mr. Kaller") is kept as he
 * typed it; this decides which person or place each spelling belongs to and what that
 * one is called in the app. Spellings he pinned by hand stay where he put them; the rest
 * are matched by the rules. Nothing here changes the calendar.
 */

export type NameKind = "person" | "place";

export type MatchRules = {
  /** "Boro Park" = "Boropark", "R' Kaller" = "R Kaller". */
  punctuation: boolean;
  /** "Chaim Kaller" = "Kaller Chaim". */
  wordOrder: boolean;
  /** "Kaller" = "Kaler". */
  doubleLetters: boolean;
  /** "Friedman" = "Fridman" = "Freedman", "Schwartz" = "Shvartz", "Cohen" = "Kohen". */
  soundAlike: boolean;
  /** "Rosen" = "Rozen": one letter added, dropped, changed or swapped, in longer names. */
  oneLetterOff: boolean;
  /** Words left out when comparing, like "mr" or "the". Lowercase. */
  ignoreWords: string[];
};

export const DEFAULT_RULES: Record<NameKind, MatchRules> = {
  person: {
    punctuation: true,
    wordOrder: true,
    doubleLetters: true,
    soundAlike: true,
    oneLetterOff: true,
    ignoreWords: ["mr", "mrs", "ms", "rabbi", "reb", "r", "the"],
  },
  place: {
    punctuation: true,
    wordOrder: false,
    doubleLetters: true,
    soundAlike: true,
    oneLetterOff: true,
    ignoreWords: ["the"],
  },
};

/** "Mr, the ,  Rabbi" → ["mr", "the", "rabbi"] */
export function parseWordList(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[,\n]/)
    .map((word) => word.replace(/[^\p{L}\p{N}\s]/gu, "").trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(words)];
}

/** Spellings that sound alike end up the same: a vowel is a vowel, and so on. */
function soundOf(word: string): string {
  return (
    word
      .replace(/sch/g, "sh")
      .replace(/t[sz]/g, "z")
      .replace(/ck/g, "k")
      .replace(/kh/g, "ch")
      .replace(/c(?!h)/g, "k")
      .replace(/ph/g, "f")
      .replace(/q/g, "k")
      .replace(/w/g, "v")
      // A y that starts a word is a consonant (Yankel); anywhere else it's a vowel (Moyshe).
      .replace(/(?!^)y/g, "i")
      .replace(/[aeiou]+/g, "a")
      .replace(/(?<=a)h$/, "")
  );
}

const collapseDoubles = (text: string) => text.replace(/(\p{L})\1+/gu, "$1");

/** What two spellings are compared by. Equal keys are the same person or place. */
export function matchKey(spelling: string, rules: MatchRules): string {
  let text = spelling.toLowerCase();
  if (rules.punctuation) text = text.replace(/['’`"]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ");
  let words = text.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !rules.ignoreWords.includes(word));
  // Multi-word entries, like "bar mitzvah", are left out as a phrase.
  let joined = ` ${kept.join(" ")} `;
  for (const phrase of rules.ignoreWords.filter((entry) => entry.includes(" "))) {
    joined = joined.replaceAll(` ${phrase} `, " ");
  }
  const rest = joined.trim().split(/\s+/).filter(Boolean);
  // A name that's nothing but ignored words is still a name.
  if (rest.length > 0) words = rest;
  if (rules.doubleLetters) words = words.map(collapseDoubles);
  if (rules.soundAlike) words = words.map((word) => collapseDoubles(soundOf(word)));
  if (rules.wordOrder) words = [...words].sort();
  return words.join(rules.punctuation ? "" : " ");
}

/** Whether two keys are one letter apart (added, dropped, changed or two swapped). */
export function oneLetterApart(a: string, b: string): boolean {
  if (a === b) return false;
  // Short names are too easily one letter apart: Katz and Kat are different people.
  if (Math.min(a.length, b.length) < 5 || a[0] !== b[0]) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let i = 0; i < a.length && diffs.length <= 2; i++) if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length === 1) return true;
    const [i, j] = diffs;
    return diffs.length === 2 && j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

/** Where a spelling goes to get a person or place of its own. Title keys never have a colon. */
export const NEW_NAME = ":new";

/** One spelling from the titles, e.g. key "kaller" written "Kaller" on 12 gigs. */
export type Spelling = {
  /** The normalized personKey or locationKey. */
  key: string;
  /** How it was written most often. */
  text: string;
  /** Gigs still in the calendar with this spelling. */
  count: number;
  /** The latest gig with this spelling, to break ties. */
  latest: string;
};

/** A person or place saved by hand: a name to show, and the spellings pinned to it. */
export type SavedName = { id: string; label: string | null; keys: string[] };

export type NameGroup = {
  /** The key the filters use: the saved name's id, or the main spelling's key. */
  id: string;
  /** Set when it's saved, i.e. it has a name or pinned spellings. */
  savedId: string | null;
  label: string;
  /** True when the label was typed in; otherwise it's the most-used spelling. */
  named: boolean;
  count: number;
  spellings: (Spelling & { pinned: boolean })[];
};

export type Names = {
  groups: NameGroup[];
  /** Spelling key → group. */
  byKey: Map<string, NameGroup>;
};

/** "neemas hachaim" → "Neemas Hachaim". Anything with a capital is left as he wrote it. */
export function displayText(text: string): string {
  if (text !== text.toLowerCase()) return text;
  return text.replace(/(^|[\s'-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

const byUse = (a: Spelling, b: Spelling) =>
  b.count - a.count || b.latest.localeCompare(a.latest) || a.key.localeCompare(b.key);

/**
 * Groups spellings into people (or places). Pinned spellings go to their saved name.
 * Every other spelling joins the saved name that has a spelling it matches, the biggest
 * if there are several, or else forms a group with the other spellings it matches.
 */
export function groupNames(spellings: Spelling[], saved: SavedName[], rules: MatchRules): Names {
  const keyOf = new Map(spellings.map((spelling) => [spelling.key, matchKey(spelling.key, rules)]));
  const savedOf = new Map<string, SavedName>();
  for (const name of saved) for (const key of name.keys) savedOf.set(key, name);

  const members = new Map<string, Spelling[]>();
  const loose: Spelling[] = [];
  for (const spelling of spellings) {
    const name = savedOf.get(spelling.key);
    if (name) members.set(name.id, [...(members.get(name.id) ?? []), spelling]);
    else loose.push(spelling);
  }

  // Which saved name each match key belongs to; the one with more gigs wins a tie.
  const size = (id: string) => (members.get(id) ?? []).reduce((total, spelling) => total + spelling.count, 0);
  const savedByMatch = new Map<string, string>();
  for (const [id, list] of members) {
    for (const spelling of list) {
      const match = keyOf.get(spelling.key)!;
      const other = savedByMatch.get(match);
      if (!other || size(id) > size(other)) savedByMatch.set(match, id);
    }
  }
  const savedMatches = [...savedByMatch.keys()];

  // Loose spellings that match a saved name join it.
  const unmatched: Spelling[] = [];
  for (const spelling of loose) {
    const match = keyOf.get(spelling.key)!;
    let id = savedByMatch.get(match);
    if (!id && rules.oneLetterOff) {
      const near = savedMatches.filter((other) => oneLetterApart(match, other)).map((other) => savedByMatch.get(other)!);
      id = near.sort((a, b) => size(b) - size(a))[0];
    }
    if (id) members.set(id, [...(members.get(id) ?? []), { ...spelling }]);
    else unmatched.push(spelling);
  }

  // The rest group with each other: same match key, or one letter apart.
  const parent = unmatched.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstWithMatch = new Map<string, number>();
  unmatched.forEach((spelling, i) => {
    const match = keyOf.get(spelling.key)!;
    const first = firstWithMatch.get(match);
    if (first === undefined) firstWithMatch.set(match, i);
    else parent[find(i)] = find(first);
  });
  if (rules.oneLetterOff) {
    const distinct = [...firstWithMatch];
    for (let a = 0; a < distinct.length; a++) {
      for (let b = a + 1; b < distinct.length; b++) {
        if (oneLetterApart(distinct[a][0], distinct[b][0])) parent[find(distinct[a][1])] = find(distinct[b][1]);
      }
    }
  }
  const autoGroups = new Map<number, Spelling[]>();
  unmatched.forEach((spelling, i) => autoGroups.set(find(i), [...(autoGroups.get(find(i)) ?? []), spelling]));

  const pinnedKeys = new Set(savedOf.keys());
  const group = (list: Spelling[], name: SavedName | null): NameGroup => {
    const sorted = [...list].sort(byUse);
    const main = sorted[0];
    return {
      id: name?.id ?? main.key,
      savedId: name?.id ?? null,
      label: name?.label || displayText(main.text),
      named: Boolean(name?.label),
      count: sorted.reduce((total, spelling) => total + spelling.count, 0),
      spellings: sorted.map((spelling) => ({ ...spelling, pinned: pinnedKeys.has(spelling.key) })),
    };
  };

  const groups = [
    ...saved.filter((name) => members.has(name.id)).map((name) => group(members.get(name.id)!, name)),
    ...[...autoGroups.values()].map((list) => group(list, null)),
  ].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  const byKey = new Map<string, NameGroup>();
  for (const entry of groups) for (const spelling of entry.spellings) byKey.set(spelling.key, entry);
  return { groups, byKey };
}

/** Counts each spelling and finds how it's written most often. */
export function countSpellings(
  rows: { key: string | null; text: string | null; gigDate: string; deleted: boolean }[],
): Spelling[] {
  const found = new Map<string, { count: number; latest: string; texts: Map<string, number> }>();
  for (const row of rows) {
    if (row.key === null) continue;
    let entry = found.get(row.key);
    if (!entry) {
      entry = { count: 0, latest: "", texts: new Map() };
      found.set(row.key, entry);
    }
    // Deleted gigs still need a group, but don't count toward it.
    if (!row.deleted) entry.count++;
    if (row.gigDate > entry.latest) entry.latest = row.gigDate;
    if (row.text) entry.texts.set(row.text, (entry.texts.get(row.text) ?? 0) + 1);
  }
  return [...found].map(([key, entry]) => {
    const text = [...entry.texts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? key;
    return { key, text, count: entry.count, latest: entry.latest };
  });
}
