export type TitleKeyword = "job" | "hold";

export type ParsedTitle =
  | {
      ok: true;
      keyword: TitleKeyword;
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

// 600, $600, 1,200, $1,200, 1.5k, 2K
const PRICE = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k)?$/i;

function parsePrice(token: string): number | null {
  const match = PRICE.exec(token);
  if (!match) return null;
  const [, whole, fraction = "", thousands] = match;
  const value = Number(whole.replace(/,/g, "") + fraction);
  return Math.round(thousands ? value * 1000 : value);
}

/**
 * Parses a title like `<person> <job|hold|on hold> [price] [location]`.
 * The keyword is the first token that is exactly "job" or "hold", ignoring case.
 */
export function parseTitle(title: string): ParsedTitle {
  const tokens = title.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: "The title is empty" };

  const index = tokens.findIndex((token) => {
    const word = token.toLowerCase();
    return word === "job" || word === "hold";
  });
  if (index === -1) return { ok: false, error: 'No "job" or "hold" in the title' };

  const keyword = tokens[index].toLowerCase() as TitleKeyword;
  const onHold = keyword === "hold" && index > 0 && tokens[index - 1].toLowerCase() === "on";
  const person = tokens.slice(0, onHold ? index - 1 : index).join(" ");
  if (!person) return { ok: false, error: `No name before "${onHold ? "on hold" : keyword}"` };

  let rest = tokens.slice(index + 1);
  const price = rest.length > 0 ? parsePrice(rest[0]) : null;
  if (price !== null) rest = rest.slice(1);
  const location = rest.length > 0 ? rest.join(" ") : null;

  return {
    ok: true,
    keyword,
    person,
    personKey: normalizeKey(person),
    price,
    location,
    locationKey: location === null ? null : normalizeKey(location),
  };
}
