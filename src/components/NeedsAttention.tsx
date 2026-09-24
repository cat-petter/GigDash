import type { CalendarNames } from "@/lib/caldav";
import { formatDay, plural } from "@/lib/format";
import type { Attention, GigRow } from "@/lib/stats";
import { Card } from "./Card";

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

  return (
    <div id="attention" className="scroll-mt-4">
      <Card
        title="Needs attention"
        note="Fix these titles in Apple Calendar. The next sync picks up the change. This list ignores the filters."
      >
        {nothing ? (
          <p className="text-sm text-muted">Nothing to fix. Every title reads cleanly.</p>
        ) : (
          <div className="space-y-3">
            <Group
              title="Titles GigDash couldn't read"
              help="A title needs a name, then “job” or “hold”, then an optional price and place, like “Kaller job 600 neemas hachaim”. These are left out of the per-person and per-place stats."
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
      </Card>
    </div>
  );
}
