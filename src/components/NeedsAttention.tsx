import type { CalendarNames } from "@/lib/caldav";
import { formatDay, plural } from "@/lib/format";
import type { Attention, GigRow } from "@/lib/stats";

function Item({ gig, reason }: { gig: GigRow; reason?: string }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words">“{gig.title}”</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">{formatDay(gig.gigDate)}</span>
      </div>
      {reason && <p className="mt-0.5 text-xs text-muted">{reason}</p>}
    </li>
  );
}

function Group({
  title,
  help,
  gigs,
  reason,
  collapsed = false,
}: {
  title: string;
  help: string;
  gigs: GigRow[];
  reason?: (gig: GigRow) => string | undefined;
  collapsed?: boolean;
}) {
  if (gigs.length === 0) return null;
  const list = (
    <ul className="divide-y divide-line">
      {gigs.map((gig) => (
        <Item key={gig.uid} gig={gig} reason={reason?.(gig)} />
      ))}
    </ul>
  );
  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      {collapsed ? (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <h3 className="text-sm font-semibold">
              {title} <span className="font-normal text-muted">({gigs.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              {help} <span className="text-accent group-open:hidden">Show them</span>
              <span className="hidden text-accent group-open:inline">Hide them</span>
            </p>
          </summary>
          <div className="mt-1">{list}</div>
        </details>
      ) : (
        <>
          <h3 className="text-sm font-semibold">
            {title} <span className="font-normal text-muted">({gigs.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted">{help}</p>
          <div className="mt-1">{list}</div>
        </>
      )}
    </div>
  );
}

/** Events to fix in Apple Calendar. It ignores the filters, so nothing hides here. */
export function NeedsAttention({ attention, names }: { attention: Attention; names: CalendarNames }) {
  const { unreadable, mismatched, recurring, unpriced } = attention;
  const nothing = unreadable.length + mismatched.length + recurring.length + unpriced.length === 0;
  const holdsName = names.holds ? `“${names.holds}”` : "the holds calendar";

  const toFix = unreadable.length + mismatched.length + recurring.length;

  return (
    <details id="attention" className="group/attention scroll-mt-4 rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-base font-semibold">Needs attention</span>
          <span className="block text-xs text-muted">
            {nothing
              ? "Nothing to fix. Every title reads cleanly."
              : toFix > 0
                ? `${plural(toFix, "title")} to fix in Apple Calendar`
                : `${plural(unpriced.length, "job")} with no price`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {toFix > 0 && (
            <span className="rounded-full bg-warn px-2 text-xs leading-5 font-semibold text-bg">{toFix}</span>
          )}
          <svg aria-hidden viewBox="0 0 12 12" className="size-3.5 text-muted transition-transform group-open/attention:rotate-180">
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      {!nothing && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted">
            Fix these titles in Apple Calendar. The next sync picks up the change. This list ignores the filters.
          </p>
          <Group
            title="Titles that couldn't be read"
            help="A title needs a name, then “job” or “hold”, then an optional price and place, like “Kaller job 600 neemas hachaim”. These are left out of the per-musician and per-place stats."
            gigs={unreadable}
          />
          <Group
            title="Title and calendar disagree"
            help="The calendar decides whether it's a job or a hold, so these are counted by their calendar."
            gigs={mismatched}
            reason={(gig) =>
              gig.status === "job"
                ? `Says “hold” but it's in “${names.gigs}”, so it's counted as a job.`
                : `Says “job” but it's in ${holdsName}, so it's counted as a hold.`
            }
          />
          <Group
            title="Repeating events"
            help="Gigs aren't expected to repeat, so only the first date is counted."
            gigs={recurring}
          />
          <Group
            title="Jobs with no price"
            help={`Money totals leave these out. Older gigs often have no price, which is fine. ${plural(unpriced.length, "job")} in all.`}
            gigs={unpriced}
            collapsed
          />
        </div>
      )}
    </details>
  );
}
