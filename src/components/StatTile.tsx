import type { ReactNode } from "react";
import { FilterLink } from "./Pending";

const TILE = "block rounded-2xl border border-line bg-surface p-3.5";

/** One headline number. Figures stay proportional here; tables use tabular ones. With a link, the tile opens those gigs. */
export function StatTile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
        {label}
        {href && (
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
            <path d="M4.5 3 7.5 6 4.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <FilterLink href={href} className={`${TILE} transition-colors hover:border-muted active:bg-bg`}>
      {body}
    </FilterLink>
  ) : (
    <div className={TILE}>{body}</div>
  );
}
