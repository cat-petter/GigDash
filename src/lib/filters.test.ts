import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  type Filters,
  dateBounds,
  inScope,
  isFiltered,
  leadBucket,
  NONE_KEY,
  parseFilters,
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
  it("defaults to this year, everyone, jobs and holds", () => {
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
        show: "hold",
        lead: "1to3m",
      }),
    ).toEqual({
      range: "custom",
      from: "2026-01-01",
      to: "2026-06-30",
      person: "kaller",
      location: NONE_KEY,
      show: "hold",
      lead: "1to3m",
    });
  });

  it("falls back to defaults for values it doesn't know", () => {
    expect(parseFilters({ range: "forever", show: "maybe", lead: "soon", person: "  " })).toEqual(DEFAULT_FILTERS);
  });

  it("takes the first of repeated parameters", () => {
    expect(parseFilters({ show: ["job", "hold"] }).show).toBe("job");
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
    expect(parseFilters({ range: "all", from: "2026-01-01" }).from).toBeNull();
  });
});

describe("toQuery and withFilter", () => {
  it("leaves defaults out of the URL", () => {
    expect(toQuery(DEFAULT_FILTERS)).toBe("");
    expect(withFilter(DEFAULT_FILTERS, {})).toBe("/");
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
  });

  it("round-trips through parseFilters", () => {
    const original = filters({ range: "custom", from: "2025-01-01", person: "reb yossi", show: "job", lead: "3m" });
    const query = toQuery(original);
    expect(parseFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(original);
  });

  it("changes one filter and keeps the rest", () => {
    expect(withFilter(filters({ show: "job" }), { person: "kaller" })).toBe("/?person=kaller&show=job");
  });

  it("drops custom dates when switching to another range", () => {
    expect(withFilter(filters({ range: "custom", from: "2025-01-01" }), { range: "all" })).toBe("/?range=all");
  });
});

describe("dateBounds", () => {
  it("covers the whole of this year, including gigs still to come", () => {
    expect(dateBounds(filters(), TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
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
