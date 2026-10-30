import type { TimeBar } from "@/lib/stats";

const WIDTH = 96;
const HEIGHT = 28;

/** A tiny bar per month, for the corner of a Stats card. Just the shape; the numbers are below it. */
export function Sparkline({ bars }: { bars: TimeBar[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.jobs));
  const step = WIDTH / Math.max(bars.length, 1);
  const width = Math.max(2, step - 2);
  const first = bars[0]?.full;
  const last = bars.at(-1)?.full;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-24 shrink-0"
      role="img"
      aria-label={first === last ? `Jobs in ${first}` : `Jobs per month, ${first} to ${last}`}
    >
      {bars.map((bar, i) => {
        const height = bar.jobs ? Math.max(3, (bar.jobs / max) * HEIGHT) : 1.5;
        return (
          <rect
            key={bar.key}
            x={i * step + (step - width) / 2}
            y={HEIGHT - height}
            width={width}
            height={height}
            rx={1}
            className={bar.jobs ? "fill-series-1" : "fill-line"}
          />
        );
      })}
    </svg>
  );
}
