"use client";

import { type ReactNode, useState } from "react";
import { Bar, BarChart, type BarShapeProps, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import { Card } from "./Card";
import { FilterLink } from "./Pending";

export type Series = {
  key: string;
  /** "job" / "jobs", for tooltips and the table header. */
  one: string;
  many: string;
  color: "var(--series-1)" | "var(--series-2)";
};

export type BarRow = {
  key: string;
  /** The axis label. */
  label: string;
  /** A longer label for the tooltip and table, e.g. "January 2026". */
  full?: string;
  /** A muted line in the tooltip, e.g. "from 7 priced jobs". */
  note?: string;
  /** Tapping the row in the table filters the dashboard to it. */
  href?: string;
  values: Record<string, number>;
};

type Props = {
  title: string;
  note?: ReactNode;
  rows: BarRow[];
  series: Series[];
  /** "up" for bars over time or buckets, "right" for ranked names. */
  direction: "up" | "right";
  format: "money" | "count";
  /** The table's first column header. */
  labelHeader: string;
  /** Shown instead of the chart when every value is zero. */
  empty: string;
};

const RADIUS = 4;
/** The surface-colored gap between stacked segments. */
const GAP = 2;
const MAX_LABEL = 16;
const ROW_HEIGHT = 34;
const PLOT_HEIGHT = 200;
/** The value axis's labels, included in the chart's height. */
const AXIS_BAND = 24;

const total = (row: BarRow, series: Series[]) => series.reduce((sum, s) => sum + (row.values[s.key] ?? 0), 0);

function formatValue(value: number, format: Props["format"]): string {
  return format === "money" ? formatMoney(value) : value.toLocaleString("en-US");
}

/** "$1.2k" on the value axis, where space is short. */
function formatTick(value: number, format: Props["format"]): string {
  if (format === "count") return value.toLocaleString("en-US");
  if (value >= 1000) return `$${Number((value / 1000).toFixed(1))}k`;
  return `$${value}`;
}

function shorten(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label;
}

/**
 * A bar segment with a rounded data end and a square baseline. Stacked segments
 * keep a small gap to the one below, and only the outermost segment is rounded.
 * The tallest bar carries its total at the tip.
 */
function Segment({
  shape,
  series,
  index,
  direction,
  format,
  maxKey,
  active,
}: {
  shape: BarShapeProps;
  series: Series[];
  index: number;
  direction: Props["direction"];
  format: Props["format"];
  maxKey: string | null;
  active: boolean;
}) {
  const row = shape.payload as BarRow;
  const { y } = shape;
  let { x, width, height } = shape;
  if (!row || width <= 0 || height <= 0) return <g />;

  const below = series.slice(0, index).some((s) => (row.values[s.key] ?? 0) > 0);
  const outermost = !series.slice(index + 1).some((s) => (row.values[s.key] ?? 0) > 0);

  if (below) {
    if (direction === "up") height -= GAP;
    else {
      x += GAP;
      width -= GAP;
    }
  }
  if (width <= 0 || height <= 0) return <g />;

  let d: string;
  if (!outermost) {
    d = `M${x},${y}h${width}v${height}h${-width}Z`;
  } else if (direction === "up") {
    const r = Math.min(RADIUS, width / 2, height);
    d = `M${x},${y + height}V${y + r}a${r},${r} 0 0 1 ${r},${-r}H${x + width - r}a${r},${r} 0 0 1 ${r},${r}V${y + height}Z`;
  } else {
    const r = Math.min(RADIUS, height / 2, width);
    d = `M${x},${y}H${x + width - r}a${r},${r} 0 0 1 ${r},${r}V${y + height - r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
  }

  const color = series[index].color;
  const label =
    outermost && row.key === maxKey ? (
      direction === "up" ? (
        <text x={x + width / 2} y={y - 6} textAnchor="middle" className="chart-label">
          {formatValue(total(row, series), format)}
        </text>
      ) : (
        <text x={x + width + 6} y={y + height / 2} dominantBaseline="central" className="chart-label">
          {formatValue(total(row, series), format)}
        </text>
      )
    ) : null;

  return (
    <g>
      <path d={d} style={{ fill: color, opacity: active ? 0.8 : 1 }} />
      {label}
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  series,
  format,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  series: Series[];
  format: Props["format"];
}) {
  const row = payload?.[0]?.payload as BarRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-32 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{row.full ?? row.label}</p>
      <ul className="space-y-0.5">
        {series.map((s) => {
          const value = row.values[s.key] ?? 0;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              {format === "money" ? (
                <strong className="font-semibold">{formatMoney(value)}</strong>
              ) : (
                <span>
                  <strong className="font-semibold">{value.toLocaleString("en-US")}</strong>{" "}
                  <span className="text-muted">{value === 1 ? s.one : s.many}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {row.note && <p className="mt-1 text-muted">{row.note}</p>}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex gap-4 text-xs text-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: s.color }} />
          {s.many[0].toUpperCase() + s.many.slice(1)}
        </li>
      ))}
    </ul>
  );
}

function Chart({ rows, series, direction, format }: Pick<Props, "rows" | "series" | "direction" | "format">) {
  let maxKey: string | null = null;
  let max = 0;
  for (const row of rows) {
    const value = total(row, series);
    if (value > max) [max, maxKey] = [value, row.key];
  }

  // The bar under the pointer (or finger, or keyboard focus) is drawn lighter.
  const shape = (index: number, active: boolean) =>
    function Shape(props: BarShapeProps) {
      return (
        <Segment
          shape={props}
          series={series}
          index={index}
          direction={direction}
          format={format}
          maxKey={maxKey}
          active={active}
        />
      );
    };

  const up = direction === "up";
  const valueAxis = {
    type: "number" as const,
    allowDecimals: false,
    tickLine: false,
    axisLine: false,
    tickFormatter: (value: number) => formatTick(value, format),
  };
  const categoryAxis = {
    type: "category" as const,
    dataKey: "label",
    tickLine: false,
    interval: "preserveStartEnd" as const,
    tickFormatter: shorten,
  };

  return (
    <BarChart
      responsive
      data={rows}
      layout={up ? "horizontal" : "vertical"}
      style={{ width: "100%", height: up ? PLOT_HEIGHT + AXIS_BAND : rows.length * ROW_HEIGHT + AXIS_BAND }}
      margin={up ? { top: 20, right: 4, bottom: 0, left: 0 } : { top: 0, right: format === "money" ? 56 : 32, bottom: 0, left: 0 }}
      barCategoryGap="28%"
    >
      <CartesianGrid vertical={!up} horizontal={up} />
      {up ? (
        <>
          <XAxis {...categoryAxis} height={AXIS_BAND} />
          <YAxis {...valueAxis} width={format === "money" ? 44 : 28} />
        </>
      ) : (
        <>
          <YAxis {...categoryAxis} width={104} interval={0} />
          <XAxis {...valueAxis} height={AXIS_BAND} />
        </>
      )}
      <Tooltip
        cursor={{ className: "recharts-tooltip-cursor" }}
        isAnimationActive={false}
        content={({ active, payload }) => (
          <ChartTooltip active={active} payload={payload} series={series} format={format} />
        )}
      />
      {series.map((s, index) => (
        <Bar
          key={s.key}
          dataKey={(row: BarRow) => row.values[s.key] ?? 0}
          name={s.many}
          stackId="total"
          maxBarSize={24}
          isAnimationActive={false}
          shape={shape(index, false)}
          activeBar={shape(index, true)}
        />
      ))}
    </BarChart>
  );
}

function DataTable({ rows, series, format, labelHeader }: Pick<Props, "rows" | "series" | "format" | "labelHeader">) {
  const showTotal = series.length > 1;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-1 py-1.5 font-medium">{labelHeader}</th>
            {series.map((s) => (
              <th key={s.key} className="px-1 py-1.5 text-right font-medium">
                {format === "money" ? "Amount" : s.many[0].toUpperCase() + s.many.slice(1)}
              </th>
            ))}
            {showTotal && <th className="px-1 py-1.5 text-right font-medium">Total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-1 py-1.5">
                {row.href ? (
                  <FilterLink href={row.href} className="text-accent">
                    {row.full ?? row.label}
                  </FilterLink>
                ) : (
                  (row.full ?? row.label)
                )}
                {row.note && <span className="block text-xs text-muted">{row.note}</span>}
              </td>
              {series.map((s) => (
                <td key={s.key} className="px-1 py-1.5 text-right align-top">
                  {formatValue(row.values[s.key] ?? 0, format)}
                </td>
              ))}
              {showTotal && (
                <td className="px-1 py-1.5 text-right align-top font-medium">{formatValue(total(row, series), format)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A bar chart with a table view of the same numbers. */
export function BarCard({ title, note, rows, series, direction, format, labelHeader, empty }: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const hasData = rows.some((row) => total(row, series) > 0);

  const toggle = hasData && (
    <div role="group" aria-label="View" className="flex shrink-0 rounded-full border border-line p-0.5 text-xs">
      {(["chart", "table"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => setView(option)}
          className={`rounded-full px-2.5 py-1 capitalize ${view === option ? "bg-fg text-bg" : "text-muted"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );

  return (
    <Card title={title} note={note} aside={toggle}>
      {!hasData ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : view === "chart" ? (
        <>
          <Legend series={series} />
          <Chart rows={rows} series={series} direction={direction} format={format} />
        </>
      ) : (
        <DataTable rows={rows} series={series} format={format} labelHeader={labelHeader} />
      )}
    </Card>
  );
}
