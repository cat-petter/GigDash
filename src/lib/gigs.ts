import { dateToDay } from "./dates";
import { forUser } from "./db";
import { countSpellings, groupNames, type MatchRules, type NameKind, type Names } from "./names";
import { loadRules, loadSavedNames } from "./names-store";
import type { GigRow } from "./stats";

export type GigData = {
  /** Every gig, including deleted ones (the holds stats count those), shaped for the stats. */
  rows: GigRow[];
  people: Names;
  places: Names;
  rules: Record<NameKind, MatchRules>;
};

/**
 * The user's gigs, with each spelling of a name or place swapped for the person or place it
 * belongs to: `person` and `location` become how they show in the app, and `personKey`
 * and `locationKey` the id the filters use.
 */
export async function loadGigs(userId: string): Promise<GigData> {
  const [gigs, saved, rules] = await Promise.all([
    forUser(userId).gig.findMany({
      select: {
        uid: true,
        rawTitle: true,
        status: true,
        titleKeyword: true,
        person: true,
        personKey: true,
        price: true,
        location: true,
        locationKey: true,
        gigDate: true,
        leadDays: true,
        heldAt: true,
        confirmedAt: true,
        parseError: true,
        recurring: true,
        deletedAt: true,
      },
    }),
    loadSavedNames(userId),
    loadRules(userId),
  ]);
  const spelled: GigRow[] = gigs.map(({ rawTitle, gigDate, deletedAt, ...gig }) => ({
    ...gig,
    title: rawTitle,
    gigDate: dateToDay(gigDate),
    deleted: deletedAt !== null,
  }));

  const people = groupNames(
    countSpellings(spelled.map((row) => ({ ...row, key: row.personKey, text: row.person }))),
    saved.person,
    rules.person,
  );
  const places = groupNames(
    countSpellings(spelled.map((row) => ({ ...row, key: row.locationKey, text: row.location }))),
    saved.place,
    rules.place,
  );

  const rows = spelled.map((row) => {
    const person = row.personKey === null ? undefined : people.byKey.get(row.personKey);
    const place = row.locationKey === null ? undefined : places.byKey.get(row.locationKey);
    return {
      ...row,
      person: person?.label ?? row.person,
      personKey: person?.id ?? row.personKey,
      location: place?.label ?? row.location,
      locationKey: place?.id ?? row.locationKey,
    };
  });
  return { rows, people, places, rules };
}
