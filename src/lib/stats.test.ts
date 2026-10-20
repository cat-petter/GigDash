import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters, NONE_KEY } from "./filters";
import {
  average,
  computeStats,
  countsByPeriod,
  filterOptions,
  type GigRow,
  median,
  needsAttention,
  personProfile,
} from "./stats";

const TODAY = "2026-09-24";
let next = 0;

function gig(overrides: Partial<GigRow> = {}): GigRow {
  next += 1;
  return {
    uid: `uid-${next}`,
    title: "Kaller job 600 neemas hachaim",
    status: "job",
    titleKeyword: "job",
    person: "Kaller",
    personKey: "kaller",
    price: 600,
    location: "neemas hachaim",
    locationKey: "neemas hachaim",
    gigDate: "2026-06-01",
    leadDays: 30,
    heldAt: null,
    confirmedAt: null,
    parseError: null,
    recurring: false,
    deleted: false,
    ...overrides,
  };
}

function hold(overrides: Partial<GigRow> = {}): GigRow {
  return gig({ status: "hold", titleKeyword: "hold", title: "Kaller hold", price: null, ...overrides });
}

function person(name: string, overrides: Partial<GigRow> = {}): GigRow {
  return gig({ person: name, personKey: name.toLowerCase(), ...overrides });
}

function stats(rows: GigRow[], filters: Partial<Filters> = {}) {
  return computeStats(rows, { ...DEFAULT_FILTERS, ...filters }, TODAY);
}

describe("median and average", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 10])).toBe(3.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });

  it("doesn't reorder the input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("averages", () => {
    expect(average([1, 2, 6])).toBe(3);
    expect(average([])).toBeNull();
  });
});

describe("money", () => {
  it("splits earned (past) from upcoming, with today counted as upcoming", () => {
    const { tiles } = stats([
      gig({ gigDate: "2026-02-01", price: 500 }),
      gig({ gigDate: "2026-09-23", price: 700 }),
      gig({ gigDate: TODAY, price: 1000 }),
      gig({ gigDate: "2026-12-01", price: 1500 }),
      gig({ gigDate: "2026-12-02", price: null }),
    ]);
    expect(tiles).toMatchObject({
      jobs: 5,
      pastJobs: 2,
      upcomingJobs: 3,
      earned: 1200,
      upcoming: 2500,
      unpriced: 1,
    });
  });

  it("leaves holds and deleted jobs out of the money", () => {
    const { tiles } = stats([
      gig({ price: 500 }),
      hold({ price: 900 }),
      gig({ price: 800, deleted: true }),
    ]);
    expect(tiles.earned).toBe(500);
  });

  it("labels a group with its most common spelling, ties going to the latest gig", () => {
    const { people } = filterOptions([
      gig({ person: "kaller", gigDate: "2026-01-01" }),
      gig({ person: "Kaller", gigDate: "2026-02-01" }),
      gig({ person: "Kaller", gigDate: "2026-03-01" }),
      gig({ person: "KALLER", gigDate: "2026-04-01" }),
    ]);
    expect(people[0].label).toBe("Kaller");

    const tie = filterOptions([gig({ person: "kaller", gigDate: "2026-05-01" }), gig({ person: "Kaller", gigDate: "2026-01-01" })]);
    expect(tie.people[0].label).toBe("kaller");
  });
});

describe("holds", () => {
  it("counts open holds, conversions and holds that fell through", () => {
    const { tiles } = stats([
      hold({ gigDate: "2026-11-01" }), // open
      hold({ gigDate: "2026-03-01" }), // date passed while still a hold: fell through
      hold({ gigDate: "2026-11-02", deleted: true }), // deleted: fell through
      gig({ confirmedAt: new Date("2026-05-10T00:00:00Z"), heldAt: new Date("2026-05-01T00:00:00Z") }),
      gig({ confirmedAt: new Date("2026-05-04T12:00:00Z"), heldAt: new Date("2026-05-01T00:00:00Z") }),
      gig(), // booked straight as a job
    ]);
    expect(tiles).toMatchObject({ openHolds: 1, converted: 2, fellThrough: 2, holdRate: 0.5 });
    expect(tiles.medianDaysToConfirm).toBe((9 + 3) / 2);
  });

  it("has no hold rate until a hold is decided", () => {
    expect(stats([hold({ gigDate: "2026-11-01" }), gig()]).tiles.holdRate).toBeNull();
  });

  it("applies the filters to deleted holds too", () => {
    const rows = [hold({ deleted: true, personKey: "kaller" }), hold({ deleted: true, personKey: "other" })];
    expect(stats(rows, { person: "kaller" }).tiles.fellThrough).toBe(1);
    expect(stats(rows, { range: "custom", from: "2027-01-01" }).tiles.fellThrough).toBe(0);
  });
});

describe("lead time", () => {
  it("takes the median and average over gigs with a known, non-negative lead time", () => {
    const { tiles } = stats([
      gig({ leadDays: 3 }),
      gig({ leadDays: 10 }),
      gig({ leadDays: 50 }),
      gig({ leadDays: 200 }),
      gig({ leadDays: null }),
      gig({ leadDays: -2 }),
    ]);
    expect(tiles).toMatchObject({ leadMedian: 30, leadAverage: 65.75, leadCounted: 4, leadMissing: 2 });
  });

  it("counts only jobs per bucket", () => {
    const histogram = stats([
      gig({ leadDays: 0 }),
      gig({ leadDays: 6 }),
      hold({ leadDays: 7, gigDate: "2026-11-01" }),
      gig({ leadDays: 95 }),
      gig({ leadDays: null }),
    ]).leadHistogram;
    expect(histogram.map(({ key, jobs }) => [key, jobs])).toEqual([
      ["lt1w", 2],
      ["1to4w", 0],
      ["1to3m", 0],
      ["3m", 1],
    ]);
  });

  it("gives the shortest, longest, average and typical lead time of jobs", () => {
    const rows = [gig({ leadDays: 2 }), gig({ leadDays: 10 }), gig({ leadDays: 90 }), hold({ leadDays: 400, gigDate: "2026-11-01" })];
    expect(stats(rows).tiles).toMatchObject({ leadShortest: 2, leadLongest: 90, leadMedian: 10, leadAverage: 34 });
  });

  it("filters by lead-time bucket", () => {
    const rows = [gig({ leadDays: 3 }), gig({ leadDays: 45 }), gig({ leadDays: null })];
    expect(stats(rows, { lead: "1to3m" }).tiles.jobs).toBe(1);
  });

});

describe("date range", () => {
  it("counts this year's gigs only, by default", () => {
    const rows = [gig({ gigDate: "2025-12-31" }), gig({ gigDate: "2026-01-01" }), gig({ gigDate: "2026-12-31" })];
    expect(stats(rows).tiles.jobs).toBe(2);
    expect(stats(rows, { range: "all" }).tiles.jobs).toBe(3);
  });
});

describe("countsByPeriod", () => {
  it("fills every month of the range, including empty ones", () => {
    const periods = countsByPeriod([gig({ gigDate: "2026-03-15" }), hold({ gigDate: "2026-03-20" })], {
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(periods).toHaveLength(12);
    expect(periods[2]).toEqual({ key: "2026-03", label: "Mar", full: "March 2026", jobs: 1 });
    expect(periods[0]).toMatchObject({ jobs: 0 });
  });

  it("spans the data when the range is open, labelling months with their year across years", () => {
    const periods = countsByPeriod([gig({ gigDate: "2025-11-02" }), gig({ gigDate: "2026-01-09" })], {
      from: null,
      to: null,
    });
    expect(periods.map((period) => period.label)).toEqual(["Nov ’25", "Dec ’25", "Jan ’26"]);
  });

  it("switches to years past 36 months", () => {
    const periods = countsByPeriod([gig({ gigDate: "2021-05-01" }), gig({ gigDate: "2026-01-01" })], {
      from: null,
      to: null,
    });
    expect(periods.map((period) => [period.key, period.jobs])).toEqual([
      ["2021", 1],
      ["2022", 0],
      ["2023", 0],
      ["2024", 0],
      ["2025", 0],
      ["2026", 1],
    ]);
  });

  it("is empty with no gigs", () => {
    expect(countsByPeriod([], { from: "2026-01-01", to: "2026-12-31" })).toEqual([]);
  });
});

describe("filterOptions", () => {
  it("lists everyone alphabetically, with 'No location' last", () => {
    const rows = [
      person("Reb Yossi", { location: null, locationKey: null }),
      person("Kaller", { location: "Ateres", locationKey: "ateres" }),
      person("kaller", { location: "ateres", locationKey: "ateres", gigDate: "2020-01-01" }),
      person("Ghost", { deleted: true }),
    ];
    const { people, locations } = filterOptions(rows);
    expect(people).toEqual([
      { key: "kaller", label: "Kaller", count: 2 },
      { key: "reb yossi", label: "Reb Yossi", count: 1 },
    ]);
    expect(locations.map((option) => option.key)).toEqual(["ateres", NONE_KEY]);
  });
});

describe("needsAttention", () => {
  it("finds unreadable titles, unpriced jobs, keyword mismatches and repeating events, ignoring deleted ones", () => {
    const unreadable = gig({ parseError: "No name", person: null, personKey: null, price: null, titleKeyword: null });
    const unpriced = gig({ price: null });
    const mismatched = gig({ titleKeyword: "hold" });
    const recurring = gig({ recurring: true });
    const attention = needsAttention([
      unreadable,
      unpriced,
      mismatched,
      recurring,
      gig(),
      hold(),
      gig({ price: null, deleted: true }),
    ]);
    expect(attention.unreadable).toEqual([unreadable]);
    expect(attention.unpriced).toEqual([unpriced]);
    expect(attention.mismatched).toEqual([mismatched]);
    expect(attention.recurring).toEqual([recurring]);
  });
});

describe("wanted", () => {
  const wanted = (overrides: Partial<GigRow> = {}) =>
    gig({ status: "wanted", titleKeyword: null, price: 800, ...overrides });

  it("counts wanted dates on their own, out of jobs, money and charts", () => {
    const rows = [gig({ gigDate: "2026-03-01" }), wanted({ gigDate: "2026-03-01" }), wanted({ gigDate: "2026-04-01" })];
    const stats = computeStats(rows, DEFAULT_FILTERS, TODAY);
    expect(stats.tiles).toMatchObject({ jobs: 1, earned: 600, openHolds: 0, wanted: 2 });
    expect(stats.byPeriod.reduce((total, period) => total + period.jobs, 0)).toBe(1);
  });

});

describe("personProfile", () => {
  it("gives a person's usual price, range, totals and dates", () => {
    const rows = [
      gig({ price: 500, gigDate: "2026-02-01" }),
      gig({ price: 600, gigDate: "2026-05-01", location: "Boro Park", locationKey: "boro park" }),
      gig({ price: 900, gigDate: "2026-10-01" }),
      gig({ price: null, gigDate: "2026-11-01" }),
      gig({ person: "Weiss", personKey: "weiss", price: 2000 }),
      gig({ status: "wanted", titleKeyword: null, gigDate: "2026-07-01" }),
    ];
    const profile = personProfile(rows, { ...DEFAULT_FILTERS, person: "kaller", lead: "3m" }, TODAY)!;
    expect(profile).toMatchObject({
      label: "Kaller",
      jobs: 4,
      played: 2,
      upcomingJobs: 2,
      typicalPrice: 600,
      lowPrice: 500,
      highPrice: 900,
      priced: 3,
      earned: 1100,
      upcoming: 900,
      lastGig: "2026-05-01",
      nextGig: "2026-10-01",
      wanted: 1,
    });
    expect(profile.topPlaces[0]).toEqual({ label: "neemas hachaim", jobs: 3 });
    expect(personProfile(rows, DEFAULT_FILTERS, TODAY)).toBeNull();
  });
});
