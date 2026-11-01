/**
 * Makes a demo user with about 150 made-up gigs, so the dashboard can be built and demoed without
 * an iCloud account. Run again, it replaces that user's rows. No one else's are touched.
 *
 *   npm run seed:demo            # local databases only
 *   npm run seed:demo -- --force # any database
 */
import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { addDays, appTimeZone, dayInZone, daysBetween, dayToDate, type Day } from "../src/lib/dates";
import { db } from "../src/lib/db";
import { parseTitle } from "../src/lib/parse-title";

const COUNT = 150;
const DEMO_ID = "demo";
// .invalid can never be a real address. Locally, sign in with it and take the link from the dev server's log.
const DEMO_EMAIL = "demo@gigdash.invalid";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A fixed seed, so every run makes the same gigs (relative to today).
let seed = 20260924;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (p: number) => random() < p;
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  let roll = random() * items.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1][0];
}

// Clients, how often they book, and where they usually are.
const PEOPLE = [
  ["Kaller", 14, "neemas hachaim"],
  ["Yitsy korblue", 9, "brooklyn"],
  ["Friedman", 8, "Ateres Chynka"],
  ["Goldstein", 7, "Eden Palace"],
  ["Schwartz", 6, "lakewood"],
  ["Weiss", 5, "Oceanview"],
  ["Katz", 4, "monsey"],
  ["Brach", 4, "Palace Royale"],
  ["Lefkowitz", 3, "Williamsburg"],
  ["Stern", 3, "Boro Park"],
  ["Halpern", 2, "lakewood"],
  ["Adler", 2, "monsey"],
  ["Gross", 1, "Eden Palace"],
  ["Mendlowitz", 1, "Terrace"],
] as const;
const LOCATIONS = [...new Set(PEOPLE.map(([, , location]) => location))];
// Other ways he writes some of them, for Settings → People and Places to put together.
const SPELLINGS: Record<string, string[]> = {
  Kaller: ["kaller", "Kaler"],
  "Yitsy korblue": ["Yitzy Korblue"],
  Friedman: ["Fridman"],
  Goldstein: ["Goldstien"],
  Schwartz: ["Shwartz"],
  lakewood: ["Lakewood", "lakewod"],
  "Boro Park": ["Boropark"],
  "neemas hachaim": ["Neimas Hachaim"],
};
const spelled = (name: string) => (SPELLINGS[name] && chance(0.2) ? pick(SPELLINGS[name]) : name);
const PRICES = [450, 500, 600, 600, 650, 750, 800, 800, 900, 1000, 1200, 1500, 1800, 2200];

function priceText(price: number): string {
  return weighted([
    [String(price), 70],
    [`$${price}`, 15],
    [price >= 1000 ? price.toLocaleString("en-US") : String(price), 10],
    [price % 100 === 0 && price >= 1000 ? `${price / 1000}k` : String(price), 5],
  ]);
}

function refuseRemoteDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL isn't set");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !process.argv.includes("--force")) {
    throw new Error(`DATABASE_URL points at ${host}, not this computer. This adds a demo user there; add --force if you mean it.`);
  }
}

/** A time on `day`, during the afternoon in New York. */
function timeOn(day: Day): Date {
  return new Date(dayToDate(day).getTime() + between(14, 23) * 60 * 60 * 1000 + between(0, 59) * 60 * 1000);
}

async function main() {
  refuseRemoteDatabase();
  const timeZone = appTimeZone();
  const now = new Date();
  const today = dayInZone(now, timeZone);
  const firstSync = new Date(now.getTime() - 45 * MS_PER_DAY);
  // He started putting prices in titles about half a year ago.
  const pricesFrom = addDays(today, -200);

  const gigs: Prisma.GigCreateManyInput[] = [];

  function add(options: {
    title: string;
    gigDate: Day;
    status: "job" | "hold";
    bookedAt: Date | null;
    heldAt?: Date | null;
    confirmedAt?: Date | null;
    deletedAt?: Date | null;
    recurring?: boolean;
  }) {
    const parsed = parseTitle(options.title);
    const { bookedAt } = options;
    const leadDays = bookedAt ? daysBetween(dayInZone(bookedAt, timeZone), options.gigDate) : null;
    const firstSeenAt = bookedAt && bookedAt > firstSync ? bookedAt : firstSync;
    gigs.push({
      userId: DEMO_ID,
      uid: `demo-${gigs.length + 1}@gigdash`,
      rawTitle: options.title,
      calendar: options.status === "job" ? "gigs" : "holds",
      status: options.status,
      titleKeyword: parsed.ok ? parsed.keyword : null,
      person: parsed.ok ? parsed.person : null,
      personKey: parsed.ok ? parsed.personKey : null,
      price: parsed.ok ? parsed.price : null,
      location: parsed.ok ? parsed.location : null,
      locationKey: parsed.ok ? parsed.locationKey : null,
      parseError: parsed.ok ? null : parsed.error,
      gigDate: dayToDate(options.gigDate),
      bookedAt,
      leadDays,
      heldAt: options.heldAt ?? (options.status === "hold" ? bookedAt : null),
      confirmedAt: options.confirmedAt ?? null,
      recurring: options.recurring ?? false,
      deletedAt: options.deletedAt ?? null,
      firstSeenAt,
      lastSeenAt: options.deletedAt ?? now,
    });
  }

  for (let i = 0; i < COUNT; i++) {
    const [person, , usual] = weighted(PEOPLE.map((entry) => [entry, entry[1]] as const));
    const gigDate = addDays(today, between(-600, 170));
    const future = gigDate >= today;

    let lead = weighted([
      [between(0, 6), 15],
      [between(7, 29), 35],
      [between(30, 89), 35],
      [between(90, 240), 15],
    ]);
    // Nothing is booked in the future.
    if (future) lead = Math.max(lead, daysBetween(today, gigDate) + between(1, 20));
    const bookedDay = addDays(gigDate, -lead);
    // Some older events came from Apple without a creation date.
    const bookedAt = !future && bookedDay < addDays(today, -300) && chance(0.15) ? null : timeOn(bookedDay);

    let status: "job" | "hold" = future ? (chance(0.72) ? "job" : "hold") : chance(0.9) ? "job" : "hold";
    let deletedAt: Date | null = null;
    let heldAt: Date | null = null;
    let confirmedAt: Date | null = null;
    if (!future && status === "hold" && chance(0.6)) {
      // A hold that fell through and was deleted from the calendar.
      const deletedDay = addDays(gigDate, -between(1, Math.max(1, Math.min(lead, 20))));
      deletedAt = deletedDay < today ? timeOn(deletedDay) : now;
    }
    if (status === "job" && bookedAt && lead > 3 && chance(0.35)) {
      // It started as a hold and was moved into Gigs later.
      heldAt = bookedAt;
      const confirmedDay = addDays(dayInZone(bookedAt, timeZone), between(1, Math.min(lead - 1, 30)));
      confirmedAt = confirmedDay < today ? timeOn(confirmedDay) : null;
      if (!confirmedAt) status = "hold";
    }

    const where = weighted([
      [usual, 60],
      [pick(LOCATIONS), 30],
      [null, 10],
    ]);
    const priced = bookedAt && bookedAt >= dayToDate(pricesFrom) ? chance(0.85) : chance(0.05);
    const keyword = status === "hold" && chance(0.2) ? "on hold" : status;
    const name = spelled(person);
    const location = where && spelled(where);
    const title = [name, keyword, priced ? priceText(pick(PRICES)) : null, location].filter(Boolean).join(" ");

    add({ title, gigDate, status, bookedAt, heldAt, confirmedAt, deletedAt });
  }

  const recent = (daysAgo: number) => timeOn(addDays(today, -daysAgo));

  // A few more spellings, so each rule has something to match.
  add({ title: "Stern job 900 Boropark", gigDate: addDays(today, -45), status: "job", bookedAt: recent(80) });
  add({ title: "Halpern job 700 lakewod", gigDate: addDays(today, 33), status: "job", bookedAt: recent(14) });
  add({ title: "R' Kaller job 650 neemas hachaim", gigDate: addDays(today, -12), status: "job", bookedAt: recent(50) });

  // Events for "Needs attention".
  add({ title: "Weiss wedding", gigDate: addDays(today, 40), status: "job", bookedAt: recent(12) });
  add({ title: "Katz 800 brooklyn", gigDate: addDays(today, -30), status: "job", bookedAt: recent(70) });
  add({ title: "Stern bar mitzvah Eden Palace", gigDate: addDays(today, 95), status: "hold", bookedAt: recent(5) });
  add({ title: "Brach hold 900 Oceanview", gigDate: addDays(today, 21), status: "job", bookedAt: recent(35) });
  add({ title: "Goldstein job 1200 Eden Palace", gigDate: addDays(today, 60), status: "hold", bookedAt: recent(9) });
  add({
    title: "Kaller job 500 neemas hachaim",
    gigDate: addDays(today, 7),
    status: "job",
    bookedAt: recent(30),
    recurring: true,
  });

  // Only the demo user's rows are replaced.
  const mine = { where: { userId: DEMO_ID } };
  await db.$transaction([
    db.user.upsert({
      where: { id: DEMO_ID },
      create: { id: DEMO_ID, name: "Demo", email: DEMO_EMAIL, emailVerified: true, timeZone },
      update: {},
    }),
    db.gig.deleteMany(mine),
    db.syncRun.deleteMany(mine),
    db.savedName.deleteMany(mine),
    db.matchRule.deleteMany(mine),
    db.gig.createMany({ data: gigs }),
  ]);

  const live = gigs.filter((gig) => !gig.deletedAt);
  const startedAt = new Date(now.getTime() - 4 * 60 * 1000);
  await db.syncRun.create({
    data: {
      userId: DEMO_ID,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 2300),
      ok: true,
      fetched: live.length,
      created: gigs.length,
      missingCreated: live.filter((gig) => !gig.bookedAt).length,
    },
  });

  const jobs = live.filter((gig) => gig.status === "job").length;
  console.log(
    `Added ${gigs.length} demo gigs (${jobs} jobs, ${live.length - jobs} holds, ${gigs.length - live.length} deleted).`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
