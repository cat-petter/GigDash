import { type CalendarNames, calendarProblems, sameName } from "@/lib/calendar-names";

export function Badge({ tone, children }: { tone: "good" | "bad" | "warn" | "muted"; children: React.ReactNode }) {
  const tones = {
    good: "text-good border-good/40",
    bad: "text-bad border-bad/40",
    warn: "text-warn border-warn/40",
    muted: "text-muted border-line",
  };
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** The calendars iCloud listed, and which of them the app reads. */
export function CalendarList({ found, names }: { found: string[]; names: CalendarNames }) {
  return (
    <>
      <p className="mb-3 text-sm text-good">Signed in to iCloud.</p>
      <ul className="divide-y divide-line text-sm">
        {found.map((name, i) => (
          <li key={`${name}-${i}`} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{name || <em className="text-muted">(no name)</em>}</span>
            {sameName(name, names.gigs) ? (
              <Badge tone="good">Read as jobs</Badge>
            ) : sameName(name, names.holds) ? (
              <Badge tone="good">Read as holds</Badge>
            ) : sameName(name, names.wanted) ? (
              <Badge tone="good">Read as wanted</Badge>
            ) : (
              <Badge tone="muted">Not read</Badge>
            )}
          </li>
        ))}
      </ul>
      {calendarProblems(found, names).map((problem) => (
        <p key={problem} className="mt-2 text-sm text-bad">
          {problem}
        </p>
      ))}
      {!found.some((name) => sameName(name, names.wanted)) && (
        <p className="mt-2 text-sm text-muted">
          No &ldquo;{names.wanted}&rdquo; calendar yet. Make one to track dates you were asked for but weren&apos;t free.
        </p>
      )}
      {!names.holds && (
        <p className="mt-2 text-sm text-warn">
          No holds calendar is set, so holds aren&apos;t tracked. Add its name under Settings → Calendar once you&apos;ve made one.
        </p>
      )}
    </>
  );
}
