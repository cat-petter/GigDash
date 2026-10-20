export type TitleKeyword = "job" | "hold" | "wanted";

export type ParsedTitle =
  | {
      ok: true;
      /** "job" or "hold" if the title says so. The calendar decides the status either way. */
      keyword: TitleKeyword | null;
      person: string;
      personKey: string;
      /** Whole dollars, or null when the title has no price. */
      price: number | null;
      location: string | null;
      locationKey: string | null;
    }
  | { ok: false; error: string };

/** Lowercase and collapse whitespace, so "Kaller" and " kaller " group together. */
export function normalizeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// 600, $600, 600$, 1,200, $1,200, 1.5k, 2K
const PRICE = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k)?\$?$/i;
// A price written so it can't be anything else: with a $ or a k.
const SURE_PRICE = /^\$|\$$|k$/i;

function parsePrice(token: string): number | null {
  const match = PRICE.exec(token);
  if (!match) return null;
  const [, whole, fraction = "", thousands] = match;
  const value = Number(whole.replace(/,/g, "") + fraction);
  return Math.round(thousands ? value * 1000 : value);
}

/** Words that come before a location, like "Kaller at boro park" or "@ brooklyn". */
const LOCATION_MARKERS = new Set(["at", "@"]);

type Token =
  | { kind: "word"; text: string }
  | { kind: "keyword"; keyword: TitleKeyword }
  | { kind: "price"; value: number; sure: boolean }
  | { kind: "marker" }
  | { kind: "break" };

function tokenize(title: string): Token[] {
  const spaced = title
    .replace(/@/g, " @ ")
    .replace(/[;|/:()]+|,(?!\d)/g, " | ")
    .replace(/\s[-–—]+\s/g, " | ");
  const words = spaced.trim().split(/\s+/).filter(Boolean);
  const tokens: Token[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();
    if (lower === "job" || lower === "hold" || lower === "wanted") {
      tokens.push({ kind: "keyword", keyword: lower });
    } else if (lower === "on" && words[i + 1]?.toLowerCase() === "hold") {
      tokens.push({ kind: "keyword", keyword: "hold" });
      i++;
    } else if (LOCATION_MARKERS.has(lower)) {
      tokens.push({ kind: "marker" });
    } else if (word === "|") {
      tokens.push({ kind: "break" });
    } else {
      const value = parsePrice(word);
      tokens.push(value === null ? { kind: "word", text: word } : { kind: "price", value, sure: SURE_PRICE.test(word) });
    }
  }
  return tokens;
}

/** A run of words between keywords, prices, markers and punctuation. */
type Run = {
  words: string[];
  afterMarker: boolean;
  beforeKeyword: boolean;
  afterKeyword: boolean;
  /** A comma or other break came between this run and the one before. */
  afterBreak: boolean;
};

function runsOf(tokens: Token[]): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  let marker = false;
  let seenKeyword = false;
  let seenBreak = false;
  for (const token of tokens) {
    if (token.kind === "word") {
      if (!current) {
        current = {
          words: [],
          afterMarker: marker,
          beforeKeyword: false,
          afterKeyword: seenKeyword,
          afterBreak: seenBreak && runs.length > 0,
        };
        runs.push(current);
        seenBreak = false;
      }
      current.words.push(token.text);
      continue;
    }
    if (token.kind === "keyword") {
      if (current && !seenKeyword) current.beforeKeyword = true;
      seenKeyword = true;
    }
    current = null;
    if (token.kind === "break") seenBreak = true;
    // A marker carries over a price, as in "at 600 boro park", but not past a keyword or break.
    if (token.kind === "marker") marker = true;
    else if (token.kind !== "price") marker = false;
  }
  return runs;
}

/** How often each phrase was a person or a location across all his titles. */
export type Lexicon = Map<string, { person: number; location: number }>;

export const EMPTY_LEXICON: Lexicon = new Map();

const MAX_PHRASE = 6;

function vote(lexicon: Lexicon, words: string[], as: "person" | "location") {
  if (words.length === 0 || words.length > MAX_PHRASE) return;
  const key = normalizeKey(words.join(" "));
  const entry = lexicon.get(key) ?? { person: 0, location: 0 };
  entry[as]++;
  lexicon.set(key, entry);
}

function known(lexicon: Lexicon, words: string[]): "person" | "location" | null {
  const entry = lexicon.get(normalizeKey(words.join(" ")));
  if (!entry || entry.person === entry.location) return null;
  return entry.person > entry.location ? "person" : "location";
}

/**
 * Learns names and places from titles whose layout makes them clear: the words
 * before "job"/"hold" are a person and the words after are a location, and words
 * after "at" or "@" are a location. Then titles where one part is already known
 * teach the other part.
 */
export function buildLexicon(titles: string[]): Lexicon {
  const lexicon: Lexicon = new Map();
  const allRuns = titles.map((title) => runsOf(tokenize(title)));

  for (const runs of allRuns) {
    const hasPersonRun = runs.some((run) => run.beforeKeyword);
    for (const run of runs) {
      if (run.afterMarker) vote(lexicon, run.words, "location");
      else if (run.beforeKeyword) vote(lexicon, run.words, "person");
      else if (hasPersonRun && run.afterKeyword) vote(lexicon, run.words, "location");
    }
    const plain = runs.filter((run) => !run.afterMarker);
    if (runs.some((run) => run.afterMarker) && plain.length === 1) vote(lexicon, plain[0].words, "person");
  }

  // Two-part titles in any order: if one part is known, the other is the opposite.
  // If neither is, a comma between them means name first, as in "Shmuli 500, john street".
  const learned: [string[], "person" | "location"][] = [];
  for (const runs of allRuns) {
    if (runs.length !== 2) continue;
    const [a, b] = runs.map((run) => known(lexicon, run.words));
    if (a && !b) learned.push([runs[1].words, a === "person" ? "location" : "person"]);
    if (b && !a) learned.push([runs[0].words, b === "person" ? "location" : "person"]);
    const plain = runs.every((run) => !run.afterMarker && !run.beforeKeyword && !run.afterKeyword);
    if (!a && !b && plain && runs[1].afterBreak) {
      learned.push([runs[0].words, "person"], [runs[1].words, "location"]);
    }
  }
  for (const [words, as] of learned) vote(lexicon, words, as);

  return lexicon;
}

type Piece = { words: string[]; as: "person" | "location" | null };

/** Splits a run into known names and places (longest match first) and unknown words. */
function splitRun(words: string[], lexicon: Lexicon): Piece[] {
  for (let length = Math.min(words.length, MAX_PHRASE); length > 0; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const as = known(lexicon, words.slice(start, start + length));
      if (!as) continue;
      return [
        ...splitRun(words.slice(0, start), lexicon),
        { words: words.slice(start, start + length), as },
        ...splitRun(words.slice(start + length), lexicon),
      ];
    }
  }
  return words.length > 0 ? [{ words, as: null }] : [];
}

/**
 * Reads the person, price and location from a title, in any order, like
 * `Kaller job 600 neemas hachaim`, `600 neemas hachaim kaller` or `Kaller $600 at boro park`.
 *
 * - The price is a number like `600`, `$600`, `1,200` or `1.5k`.
 * - Words after "at" or "@" are the location.
 * - Names and places it has seen in his other titles (`lexicon`) are recognised anywhere.
 * - Otherwise the first unknown part is the person and the next is the location.
 * - "job", "hold" and "on hold" are optional and only flag a title that disagrees with its calendar.
 */
export function parseTitle(title: string, lexicon: Lexicon = EMPTY_LEXICON): ParsedTitle {
  const tokens = tokenize(title);
  if (tokens.length === 0) return { ok: false, error: "The title is empty" };

  const keyword = tokens.find((token) => token.kind === "keyword")?.keyword ?? null;
  const prices = tokens.filter((token) => token.kind === "price");
  const price = (prices.find((token) => token.sure) ?? prices[0])?.value ?? null;

  const person: string[] = [];
  const location: string[] = [];
  const unknown: string[][] = [];
  for (const run of runsOf(tokens)) {
    if (run.afterMarker) {
      location.push(...run.words);
      continue;
    }
    for (const piece of splitRun(run.words, lexicon)) {
      if (piece.as === "person" && person.length === 0) person.push(...piece.words);
      else if (piece.as === "location" && location.length === 0) location.push(...piece.words);
      else unknown.push(piece.words);
    }
  }
  for (const words of unknown) {
    if (person.length === 0) person.push(...words);
    else if (location.length === 0) location.push(...words);
    else location.push(...words);
  }

  if (person.length === 0) return { ok: false, error: "No name in the title" };
  const personText = person.join(" ");
  const locationText = location.length > 0 ? location.join(" ") : null;
  return {
    ok: true,
    keyword,
    person: personText,
    personKey: normalizeKey(personText),
    price,
    location: locationText,
    locationKey: locationText === null ? null : normalizeKey(locationText),
  };
}
