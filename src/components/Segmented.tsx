import { FilterLink } from "./Pending";

/** A row of links that works like a segmented control, e.g. Upcoming · Completed · All. */
export function Segmented<T extends string>({
  label,
  options,
  current,
  hrefOf,
}: {
  label: string;
  options: { key: T; label: string }[];
  current: T;
  hrefOf: (key: T) => string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-1 rounded-xl bg-line/60 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = current === option.key;
        return (
          <FilterLink
            key={option.key}
            href={hrefOf(option.key)}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className={`rounded-lg py-1.5 text-center text-sm font-medium ${selected ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {option.label}
          </FilterLink>
        );
      })}
    </div>
  );
}
