import type { ReactNode } from "react";
import type { Day } from "@/lib/dates";
import {
  DEFAULT_FILTERS,
  type Filters,
  linkTo,
  NONE_KEY,
  periodBounds,
  periodLabel,
  perOf,
  PERS,
  rangeLabel,
  withFilter,
} from "@/lib/filters";
import { formatDay, formatMoney, plural } from "@/lib/format";
import {
  type FilterOption,
  type GigRow,
  jobsOverTime,
  leaders,
  type Profile,
  profile,
  rankPeriods,
  type Top,
} from "@/lib/stats";
import { Card } from "./Card";
import { CustomDates, NamePicker, RangePicker } from "./CardControls";
import { LeadTimes } from "./LeadTimes";
import { FilterLink } from "./Pending";
import { Segmented } from "./Segmented";
import { Sparkline } from "./Sparkline";

const arrow = (
  <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-muted">
    <path d="M4.5 3 7.5 6 4.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ROW = "transition-colors hover:border-muted active:bg-bg";

/** One of the four headlines: what it is, who or when, and how many. */
function Headline({ label, top, value, href }: { label: string; top: Top | null; value: string; href: string }) {
  if (!top) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 text-sm text-muted">Not enough jobs yet.</p>
      </div>
    );
  }
  return (
    <FilterLink href={href} className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 ${ROW}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold">{top.label}</p>
      </div>
      <p className="shrink-0 text-right font-semibold tabular-nums">{value}</p>
      {arrow}
    </FilterLink>
  );
}

function Fact({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="flex items-center gap-1 text-xs text-muted">
        {label}
        {href && arrow}
      </dt>
      <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="truncate text-xs text-muted">{sub}</dd>}
    </>
  );
  return href ? (
    <FilterLink href={href} className="-m-2 block min-w-0 rounded-xl p-2 transition-colors hover:bg-bg active:bg-line/60">
      {body}
    </FilterLink>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}

const topSub = (top: Top | undefined) => (top ? plural(top.jobs, "gig") : undefined);

function priceSub(p: Profile): string {
  if (p.typicalPrice === null) return "No prices yet";
  const range =
    p.lowPrice !== null && p.highPrice !== null && p.lowPrice !== p.highPrice
      ? `${formatMoney(p.lowPrice)}–${formatMoney(p.highPrice)}`
      : null;
  return [range, p.averagePrice !== null && `avg ${formatMoney(p.averagePrice)}`].filter(Boolean).join(" · ");
}

/** The lead-time strip and the note about unpriced jobs, at the bottom of every card. */
function CardFooter({ p }: { p: Profile }) {
  return (
    <>
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs text-muted">Lead time · how far ahead these jobs were booked</p>
        <LeadTimes lead={p} />
      </div>
      {p.priced < p.jobs && (
        <p className="mt-3 text-xs text-muted">
          {plural(p.jobs - p.priced, "job")} with no price {p.jobs - p.priced === 1 ? "isn't" : "aren't"} counted in the
          money.
        </p>
      )}
    </>
  );
}

function BackLink() {
  return (
    <FilterLink href={linkTo({ tab: "stats" })} className="inline-flex items-center gap-1 px-1 text-sm text-accent">
      <svg aria-hidden viewBox="0 0 12 12" className="size-3">
        <path d="M7.5 3 4.5 6 7.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Stats
    </FilterLink>
  );
}

/** Adds the current choice if it's no longer in the list, e.g. from an old bookmark. */
function withCurrent(options: FilterOption[], current: string): FilterOption[] {
  if (options.some((option) => option.key === current)) return options;
  return [...options, { key: current, label: current === NONE_KEY ? "No name" : current, count: 0 }];
}

/** One place or one musician: everything about their gigs, in the dates picked. */
function NameCard({
  kind,
  rows,
  filters,
  today,
  options,
}: {
  kind: "location" | "musician";
  rows: GigRow[];
  filters: Filters;
  today: Day;
  options: FilterOption[];
}) {
  const field = kind === "location" ? "location" : "person";
  const key = filters[field]!;
  const dates = { range: filters.range, from: filters.from, to: filters.to };
  const p = profile(rows, { ...DEFAULT_FILTERS, ...dates, [field]: key }, today);
  const choices = withCurrent(options, key);
  const label = choices.find((option) => option.key === key)!.label;

  // The last 12 months of jobs, starting no earlier than the first job of all.
  const start = jobsOverTime(rows, "month", today)[0]?.key;
  const mine = rows.filter((row) => ((field === "person" ? row.personKey : row.locationKey) ?? NONE_KEY) === key);
  const trend = jobsOverTime(mine, "month", today, start).slice(-12);

  const gigs = (change: Partial<Filters>) => linkTo({ tab: "gigs", ...dates, [field]: key, ...change });
  const other = kind === "location" ? p.topPeople[0] : p.topPlaces[0];
  const otherHref =
    other &&
    linkTo(
      kind === "location"
        ? { tab: "stats", card: "musician", person: other.key, ...dates }
        : { tab: "stats", card: "location", location: other.key, ...dates },
    );
  const busiest = p.busiestMonth;

  return (
    <>
      <BackLink />
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{kind === "location" ? "Location" : "Musician"}</p>
            <NamePicker filters={filters} field={field} label={label} options={choices} />
          </div>
          <Sparkline bars={trend} />
        </div>
        <div className="mt-3">
          <RangePicker filters={filters} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <Fact
            label="Gigs"
            value={p.jobs.toLocaleString("en-US")}
            sub={`${p.played} played · ${p.upcomingJobs} coming up`}
            href={gigs({ when: "all", show: "job" })}
          />
          <Fact
            label="Earned"
            value={formatMoney(p.earned)}
            sub={p.upcoming > 0 ? `+${formatMoney(p.upcoming)} coming up` : undefined}
          />
          <Fact label="Last gig" value={p.lastGig ? formatDay(p.lastGig) : "—"} />
          <Fact
            label="Next gig"
            value={p.nextGig ? formatDay(p.nextGig) : "—"}
            href={p.nextGig ? gigs({ when: "upcoming", show: "job" }) : undefined}
          />
          <Fact
            label={kind === "location" ? "Most frequent musician" : "Most frequent location"}
            value={other?.label ?? "—"}
            sub={topSub(other)}
            href={otherHref || undefined}
          />
          <Fact
            label="Busiest month"
            value={busiest ? periodLabel(busiest.key).split(" ")[0] : "—"}
            sub={busiest ? `${busiest.key.slice(0, 4)} · ${plural(busiest.jobs, "gig")}` : undefined}
            href={
              busiest
                ? gigs({ range: "custom", ...periodBounds(busiest.key), when: "all", show: "job" })
                : undefined
            }
          />
          <Fact label={kind === "location" ? "Typical price" : "Usually pays"} value={p.typicalPrice === null ? "—" : formatMoney(p.typicalPrice)} sub={priceSub(p)} />
          <Fact
            label="Holds"
            value={p.openHolds.toLocaleString("en-US")}
            sub={p.holdRate === null ? "Open" : `Open · ${Math.round(p.holdRate * 100)}% became jobs`}
          />
          {p.wanted > 0 && <Fact label="Asked, not free" value={p.wanted.toLocaleString("en-US")} />}
        </dl>
        <CardFooter p={p} />
      </section>
    </>
  );
}

const UNITS = { month: "month", half: "6 months", year: "year" } as const;

/** The busiest month, half year or year (or any dates he picks), and every other one ranked under it. */
function BusiestCard({ rows, filters, today }: { rows: GigRow[]; filters: Filters; today: Day }) {
  const per = filters.per;
  const ranks = per === "custom" ? [] : rankPeriods(rows, per);
  const key =
    per === "custom" ? null : filters.period && perOf(filters.period) === per ? filters.period : (ranks[0]?.key ?? null);
  const bounds = key ? periodBounds(key) : { from: filters.from, to: filters.to };
  const dates = { range: "custom" as const, ...bounds };
  const p = profile(rows, { ...DEFAULT_FILTERS, ...dates }, today);
  const place = p.topPlaces[0];
  const musician = p.topPeople[0];
  const kicker =
    per === "custom" ? "Your dates" : key && key === ranks[0]?.key ? `Busiest ${UNITS[per]}` : `One ${UNITS[per]}`;
  const title = key ? periodLabel(key) : rangeLabel({ ...DEFAULT_FILTERS, ...dates });

  return (
    <>
      <BackLink />
      <Segmented
        label="Busiest"
        options={PERS}
        current={per}
        hrefOf={(next) =>
          withFilter(filters, { per: next, period: null, range: next === "custom" ? "custom" : "all", from: null, to: null })
        }
      />
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs font-medium text-muted">{kicker}</p>
        <p className="text-xl font-semibold">{title}</p>
        {per === "custom" && (
          <div className="mt-3">
            <CustomDates filters={filters} />
          </div>
        )}
        {per !== "custom" && !key ? (
          <p className="mt-3 text-sm text-muted">No jobs yet.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <Fact
                label="Gigs"
                value={p.jobs.toLocaleString("en-US")}
                sub={`${p.played} played · ${p.upcomingJobs} coming up`}
                href={linkTo({ tab: "gigs", ...dates, when: "all", show: "job" })}
              />
              <Fact
                label="Earned"
                value={formatMoney(p.earned)}
                sub={p.upcoming > 0 ? `+${formatMoney(p.upcoming)} coming up` : undefined}
              />
              <Fact
                label="Most frequent location"
                value={place?.label ?? "—"}
                sub={topSub(place)}
                href={place && linkTo({ tab: "stats", card: "location", location: place.key, ...dates })}
              />
              <Fact
                label="Most frequent musician"
                value={musician?.label ?? "—"}
                sub={topSub(musician)}
                href={musician && linkTo({ tab: "stats", card: "musician", person: musician.key, ...dates })}
              />
              <Fact label="Typical price" value={p.typicalPrice === null ? "—" : formatMoney(p.typicalPrice)} sub={priceSub(p)} />
              <Fact
                label="Holds"
                value={p.openHolds.toLocaleString("en-US")}
                sub={p.holdRate === null ? "Open" : `Open · ${Math.round(p.holdRate * 100)}% became jobs`}
              />
            </dl>
            <CardFooter p={p} />
          </>
        )}
      </section>
      {ranks.length > 1 && per !== "custom" && (
        <Card title={`Every ${UNITS[per]}, busiest first`} note="Tap one to see its numbers.">
          <ul className="-mx-4 -mb-4 divide-y divide-line border-t border-line">
            {ranks.map((rank) => (
              <li key={rank.key}>
                <FilterLink
                  href={withFilter(filters, { period: rank.key })}
                  aria-current={rank.key === key ? "true" : undefined}
                  className={`flex items-baseline gap-3 px-4 py-2.5 text-sm active:bg-bg ${rank.key === key ? "bg-accent/8 font-medium" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{rank.label}</span>
                  <span className="text-muted tabular-nums">{plural(rank.jobs, "gig")}</span>
                  <span className="w-16 text-right tabular-nums">{rank.money ? formatMoney(rank.money) : "—"}</span>
                </FilterLink>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** The Stats tab: four headlines over every gig, each opening a card, then everyone ranked. */
export function StatsView({
  rows,
  filters,
  today,
  people,
  places,
}: {
  rows: GigRow[];
  filters: Filters;
  today: Day;
  people: FilterOption[];
  places: FilterOption[];
}) {
  if (filters.card === "location" && filters.location) {
    return <NameCard kind="location" rows={rows} filters={filters} today={today} options={places} />;
  }
  if (filters.card === "musician" && filters.person) {
    return <NameCard kind="musician" rows={rows} filters={filters} today={today} options={people} />;
  }
  if (filters.card === "busiest") return <BusiestCard rows={rows} filters={filters} today={today} />;

  const top = leaders(rows);
  return (
    <>
      <div className="space-y-3">
        <Headline
          label="Most played location"
          top={top.place}
          value={top.place ? plural(top.place.jobs, "gig") : ""}
          href={linkTo({ tab: "stats", card: "location", location: top.place?.key ?? null })}
        />
        <Headline
          label="Most hired by"
          top={top.hiredMost}
          value={top.hiredMost ? plural(top.hiredMost.jobs, "gig") : ""}
          href={linkTo({ tab: "stats", card: "musician", person: top.hiredMost?.key ?? null })}
        />
        <Headline
          label="Paid most by"
          top={top.paidMost}
          value={top.paidMost ? formatMoney(top.paidMost.money) : ""}
          href={linkTo({ tab: "stats", card: "musician", person: top.paidMost?.key ?? null })}
        />
        <Headline
          label="Busiest month"
          top={top.busiestMonth}
          value={top.busiestMonth ? plural(top.busiestMonth.jobs, "gig") : ""}
          href={linkTo({ tab: "stats", card: "busiest" })}
        />
      </div>
    </>
  );
}
