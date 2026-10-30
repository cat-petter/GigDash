import type { Lead } from "@/lib/stats";

/** Shortest, typical, average and longest lead time, side by side. Always the four together. */
export function LeadTimes({ lead, className = "" }: { lead: Lead; className?: string }) {
  const days: [string, number | null][] = [
    ["Shortest", lead.leadShortest],
    ["Typical", lead.leadMedian],
    ["Average", lead.leadAverage],
    ["Longest", lead.leadLongest],
  ];
  return (
    <dl className={`grid grid-cols-4 gap-2 text-center ${className}`}>
      {days.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{value === null ? "—" : `${Math.round(value)}d`}</dd>
        </div>
      ))}
    </dl>
  );
}
