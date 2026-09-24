import { dateToDay } from "./dates";
import { db } from "./db";
import type { GigRow } from "./stats";

/** Every gig, including deleted ones (the holds stats count those), shaped for the stats. */
export async function loadGigRows(): Promise<GigRow[]> {
  const gigs = await db.gig.findMany({
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
  });
  return gigs.map(({ rawTitle, gigDate, deletedAt, ...gig }) => ({
    ...gig,
    title: rawTitle,
    gigDate: dateToDay(gigDate),
    deleted: deletedAt !== null,
  }));
}
