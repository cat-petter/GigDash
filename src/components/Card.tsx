import type { ReactNode } from "react";

type Props = {
  title: string;
  /** A short line under the title. */
  note?: ReactNode;
  /** Shown to the right of the title, e.g. a toggle. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, note, aside, children, className = "" }: Props) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
