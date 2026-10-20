import { formatDay, formatMoney, plural } from "@/lib/format";
import type { Profile } from "@/lib/stats";

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

/** One person's usual price, totals and habits, shown when the dashboard is filtered to them. */
export function PersonProfile({ profile }: { profile: Profile }) {
  const p = profile;
  const range =
    p.lowPrice !== null && p.highPrice !== null && p.lowPrice !== p.highPrice
      ? `${formatMoney(p.lowPrice)}–${formatMoney(p.highPrice)}`
      : undefined;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{p.label}</h2>
      <p className="text-xs text-muted">In the dates you picked</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact
          label="Usually pays"
          value={p.typicalPrice === null ? "—" : formatMoney(p.typicalPrice)}
          sub={
            p.typicalPrice === null
              ? "No prices yet"
              : [range, p.averagePrice !== null && `avg ${formatMoney(p.averagePrice)}`].filter(Boolean).join(" · ")
          }
        />
        <Fact
          label="Jobs"
          value={p.jobs.toLocaleString("en-US")}
          sub={`${p.played} played · ${p.upcomingJobs} coming up`}
        />
        <Fact
          label="Earned"
          value={formatMoney(p.earned)}
          sub={p.upcoming > 0 ? `+${formatMoney(p.upcoming)} coming up` : undefined}
        />
        <Fact
          label="Lead time"
          value={p.leadMedian === null ? "—" : plural(Math.round(p.leadMedian), "day")}
          sub={
            p.leadMedian === null
              ? "No booking dates"
              : `Typical · ${p.leadShortest}–${p.leadLongest} days`
          }
        />
        <Fact label="Last gig" value={p.lastGig ? formatDay(p.lastGig) : "—"} />
        <Fact label="Next gig" value={p.nextGig ? formatDay(p.nextGig) : "—"} />
        <Fact
          label="Holds"
          value={p.openHolds.toLocaleString("en-US")}
          sub={p.holdRate === null ? "Open" : `Open · ${Math.round(p.holdRate * 100)}% became jobs`}
        />
        <Fact label="Asked, not free" value={p.wanted.toLocaleString("en-US")} />
        {p.topPlaces.length > 0 && (
          <Fact
            label="Usually at"
            value={p.topPlaces[0].label}
            sub={p.topPlaces.map((place) => `${place.label} (${place.jobs})`).join(" · ")}
          />
        )}
      </dl>
      {p.priced < p.jobs && (
        <p className="mt-3 text-xs text-muted">
          {plural(p.jobs - p.priced, "job")} with no price {p.jobs - p.priced === 1 ? "isn't" : "aren't"} counted in what they usually pay.
        </p>
      )}
    </section>
  );
}
