import { describe, expect, it } from "vitest";
import {
  clearedFilters,
  DEFAULT_FILTERS,
  type Filters,
  dateBounds,
  inScope,
  isFiltered,
  leadBucket,
  monthEnd,
  NONE_KEY,
  parseFilters,
  periodBounds,
  periodLabel,
  periodOf,
  rangeLabel,
  toQuery,
  withFilter,
} from "./filters";

const TODAY = "2026-09-24";

function filters(overrides: Partial<Filters> = {}): Filters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

const row = {
  status: "job" as const,
  personKey: "kaller",
  locationKey: "neemas hachaim",
  gigDate: "2026-11-01",
  leadDays: 40,
};

describe("leadBucket", () => {
  it("puts each lead time in one bucket, with inclusive edges", () => {
    expect(leadBucket(0)).toBe("lt1w");
    expect(leadBucket(6)).toBe("lt1w");
    expect(leadBucket(7)).toBe("1to4w");
    expect(leadBucket(29)).toBe("1to4w");
    expect(leadBucket(30)).toBe("1to3m");
    expect(leadBucket(89)).toBe("1to3m");
    expect(leadBucket(90)).toBe("3m");
    expect(leadBucket(900)).toBe("3m");
  });

  it("leaves unknown and negative lead times out of every bucket", () => {
    expect(leadBucket(null)).toBeNull();
    expect(leadBucket(-1)).toBeNull();
  });
});

describe("parseFilters", () => {
  it("defaults to all time, everyone, and the Overview tab", () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parseFilters({
        range: "custom",
        from: "2026-01-01",
        to: "2026-06-30",
        person: "kaller",
        location: NONE_KEY,
        lead: "1to3m",
        tab: "gigs",
        when: "past",
        show: "hold",
        sort: "lead-desc",
      }),
    ).toEqual({
      range: "custom",
      from: "2026-01-01",
      to: "2026-06-30",
      person: "kaller",
      location: NONE_KEY,
      lead: "1to3m",
      tab: "gigs",
      when: "past",
      show: "hold",
      sort: "lead-desc",
      section: "people",
      card: null,
      per: "month",
      period: null,
    });
  });

  it("falls back to defaults for values it doesn't know", () => {
    expect(
      parseFilters({ range: "forever", lead: "soon", person: "  ", tab: "people", when: "soon", sort: "name" }),
    ).toEqual(DEFAULT_FILTERS);
  });

  it("takes the first of repeated parameters", () => {
    expect(parseFilters({ person: ["kaller", "weiss"] }).person).toBe("kaller");
  });

  it("swaps custom dates given the wrong way round and drops bad ones", () => {
    expect(parseFilters({ range: "custom", from: "2026-06-30", to: "2026-01-01" })).toMatchObject({
      from: "2026-01-01",
      to: "2026-06-30",
    });
    expect(parseFilters({ range: "custom", from: "2026-02-30", to: "June" })).toMatchObject({
      from: null,
      to: null,
    });
  });

  it("ignores from and to unless the range is custom", () => {
    expect(parseFilters({ range: "year", from: "2026-01-01" }).from).toBeNull();
  });
});

describe("toQuery and withFilter", () => {
  it("leaves defaults out of the URL", () => {
    expect(toQuery(DEFAULT_FILTERS)).toBe("");
    expect(withFilter(DEFAULT_FILTERS, {})).toBe("/");
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
  });

  it("round-trips through parseFilters", () => {
    const original = filters({
      range: "custom",
      from: "2025-01-01",
      person: "reb yossi",
      lead: "3m",
      tab: "gigs",
      when: "all",
      sort: "price-desc",
    });
    const query = toQuery(original);
    expect(parseFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(original);
  });

  it("changes one filter and keeps the rest", () => {
    expect(withFilter(filters({ lead: "3m" }), { person: "kaller" })).toBe("/?person=kaller&lead=3m");
  });

  it("drops custom dates when switching to another range", () => {
    expect(withFilter(filters({ range: "custom", from: "2025-01-01" }), { range: "year" })).toBe("/?range=year");
  });

  it("doesn't count the tab or the Gigs tab's own choices as filters", () => {
    expect(isFiltered(filters({ tab: "gigs", when: "all", show: "job", sort: "lead" }))).toBe(false);
    expect(isFiltered(filters({ tab: "settings", section: "rules" }))).toBe(false);
    expect(isFiltered(filters({ range: "month" }))).toBe(true);
  });

  it("reads the Settings section, falling back to People", () => {
    expect(parseFilters({ tab: "settings", section: "places" })).toEqual(filters({ tab: "settings", section: "places" }));
    expect(parseFilters({ section: "nope" }).section).toBe("people");
    expect(withFilter(DEFAULT_FILTERS, { tab: "settings", section: "rules" })).toBe("/?tab=settings&section=rules");
  });

  it("clears the dates, person and place but keeps the tab's own choices", () => {
    expect(clearedFilters(filters({ tab: "gigs", person: "kaller", range: "year", when: "past" }))).toEqual(
      filters({ tab: "gigs", when: "past" }),
    );
  });

  it("reads the Stats tab's card and period, dropping bad periods", () => {
    const card = filters({ tab: "stats", card: "busiest", per: "half", period: "2026-H2" });
    expect(toQuery(card)).toBe("tab=stats&card=busiest&per=half&period=2026-H2");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(toQuery(card))))).toEqual(card);
    expect(parseFilters({ card: "nope", per: "week", period: "2026-13" })).toEqual(DEFAULT_FILTERS);
  });
});

describe("periods", () => {
  it("knows the month, half year and year a day is in, and their first and last days", () => {
    expect(periodOf("2026-07-04", "month")).toBe("2026-07");
    expect(periodOf("2026-07-04", "half")).toBe("2026-H2");
    expect(periodOf("2026-06-30", "half")).toBe("2026-H1");
    expect(periodOf("2026-07-04", "year")).toBe("2026");
    expect(periodBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("2026-H2")).toEqual({ from: "2026-07-01", to: "2026-12-31" });
    expect(periodBounds("2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(["2026-11", "2026-H1", "2026"].map(periodLabel)).toEqual(["November 2026", "Jan–Jun 2026", "2026"]);
  });

  it("names a range, spotting custom dates that are a whole month or year", () => {
    expect(rangeLabel(filters({ range: "6m" }))).toBe("Last 6 months");
    expect(rangeLabel(filters({ range: "custom", from: "2026-03-01", to: "2026-03-31" }))).toBe("March 2026");
    expect(rangeLabel(filters({ range: "custom", from: "2026-01-01", to: "2026-12-31" }))).toBe("2026");
    expect(rangeLabel(filters({ range: "custom", from: "2026-03-02", to: "2026-03-31" }))).toBe(
      "Mar 2, 2026 – Mar 31, 2026",
    );
    expect(rangeLabel(filters({ range: "custom", from: "2026-03-02" }))).toBe("From Mar 2, 2026");
  });
});

describe("dateBounds", () => {
  it("covers the whole of this year, including gigs still to come", () => {
    expect(dateBounds(filters({ range: "year" }), TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("covers the whole of this month", () => {
    expect(dateBounds(filters({ range: "month" }), TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("covers the last 365 days up to today", () => {
    expect(dateBounds(filters({ range: "12m" }), TODAY)).toEqual({ from: "2025-09-25", to: TODAY });
  });

  it("is open for all time, and open at either end for custom", () => {
    expect(dateBounds(filters({ range: "all" }), TODAY)).toEqual({ from: null, to: null });
    expect(dateBounds(filters({ range: "custom", from: "2026-03-01" }), TODAY)).toEqual({
      from: "2026-03-01",
      to: null,
    });
  });
});

describe("monthEnd", () => {
  it("knows how long each month is", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
});

describe("inScope", () => {
  it("includes both ends of the date range", () => {
    const range = filters({ range: "custom", from: "2026-11-01", to: "2026-11-01" });
    expect(inScope(row, range, TODAY)).toBe(true);
    expect(inScope({ ...row, gigDate: "2026-10-31" }, range, TODAY)).toBe(false);
    expect(inScope({ ...row, gigDate: "2026-11-02" }, range, TODAY)).toBe(false);
  });

  it("filters by person, location and lead time", () => {
    expect(inScope(row, filters({ person: "kaller" }), TODAY)).toBe(true);
    expect(inScope(row, filters({ person: "reb yossi" }), TODAY)).toBe(false);
    expect(inScope(row, filters({ location: "neemas hachaim" }), TODAY)).toBe(true);
    expect(inScope(row, filters({ lead: "1to3m" }), TODAY)).toBe(true);
    expect(inScope(row, filters({ lead: "3m" }), TODAY)).toBe(false);
    expect(inScope({ ...row, leadDays: null }, filters({ lead: "lt1w" }), TODAY)).toBe(false);
  });

  it("matches gigs with no location to the 'No location' option", () => {
    expect(inScope({ ...row, locationKey: null }, filters({ location: NONE_KEY }), TODAY)).toBe(true);
    expect(inScope(row, filters({ location: NONE_KEY }), TODAY)).toBe(false);
  });
});
