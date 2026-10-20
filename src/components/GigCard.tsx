import { type Day, dayInZone, daysBetween, dayToDate } from "@/lib/dates";
import { formatMoney, plural } from "@/lib/format";
import type { GigRow } from "@/lib/stats";

const STATUS = {
  job: { label: "Booked", color: "bg-series-1" },
  hold: { label: "On hold", color: "bg-series-2" },
  wanted: { label: "Asked, not free", color: "bg-series-3" },
} as const;

/** "Today", "Tomorrow", "In 12 days", "3 days ago". */
function fromToday(today: Day, day: Day): string {
  const days = daysBetween(today, day);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${plural(days, "day")}` : `${plural(-days, "day")} ago`;
}

function part(day: Day, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(dayToDate(day));
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** One gig and everything known about it. Read-only: change it in the calendar. */
export function GigCard({ gig, today, timeZone }: { gig: GigRow; today: Day; timeZone: string }) {
  const passedHold = gig.status === "hold" && gig.gigDate < today;
  const status = STATUS[gig.status];
  const lead =
    gig.leadDays === null ? "Not known" : gig.leadDays < 0 ? "Added after" : plural(gig.leadDays, "day");
  // A hold that became a job keeps the hold's lead time; this is when it was confirmed.
  const confirmedAhead = gig.confirmedAt ? daysBetween(dayInZone(gig.confirmedAt, timeZone), gig.gigDate) : null;

  return (
    <article className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex gap-3">
        <time
          dateTime={gig.gigDate}
          className="flex w-13 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-bg py-1.5 leading-none"
        >
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
            {part(gig.gigDate, { weekday: "short" })}
          </span>
          <span className="my-1 text-xl font-semibold tabular-nums">{part(gig.gigDate, { day: "numeric" })}</span>
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
            {part(gig.gigDate, { month: "short" })}
          </span>
        </time>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate font-semibold">{gig.person ?? gig.title}</h3>
            <p className={`shrink-0 font-semibold tabular-nums ${gig.price === null ? "text-sm text-muted" : ""}`}>
              {gig.price === null ? (gig.status === "job" ? "No price" : "") : formatMoney(gig.price)}
            </p>
          </div>
          <p className="truncate text-sm text-muted">{gig.location ?? (gig.parseError ? gig.parseError : "No location")}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            <span aria-hidden className={`size-2 rounded-full ${status.color}`} />
            {passedHold ? "Hold, date passed" : status.label}
            {gig.recurring && <span className="text-muted"> · repeats, counted once</span>}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
        <Fact label="Lead time" value={lead} />
        <Fact label="When" value={fromToday(today, gig.gigDate)} />
        {confirmedAhead !== null && <Fact label="Confirmed ahead" value={plural(confirmedAhead, "day")} />}
      </dl>
    </article>
  );
}
