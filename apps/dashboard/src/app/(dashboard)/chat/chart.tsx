"use client";

/**
 * Draws a chart the model asked for.
 *
 * The model supplies data, never drawing code, so everything about how a chart
 * looks is decided here — which is why every chart in Onirix reads as the same
 * chart. The spec arrives as the *input* of a `render_chart` tool call, so this
 * renders straight from the streaming part: rows appear as the model emits
 * them rather than after it finishes.
 */
import {
  chartSpecSchema,
  toChartRows,
  type ChartRow,
  type ChartSeries,
  type ChartSpec,
} from "@onirix/llm/chart";
import { CheckIcon, CopyIcon, TableIcon } from "@onirix/ui/lib/icons";
import { useMemo, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { Button } from "@onirix/ui/components/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@onirix/ui/components/chart";
import { Skeleton } from "@onirix/ui/components/skeleton";

import type { ChartPart, CitedSource } from "@/lib/chat-message";

/** Mark specs. Thin marks, air in the band — the data is the only loud thing. */
const MAX_BAR_WIDTH = 24;
const LINE_WIDTH = 2;
const DOT_RADIUS = 4;
/** A wash behind the line, never a saturated block. */
const AREA_OPACITY = 0.1;

/**
 * Slot order is fixed and never cycled: series 1 always takes `--chart-1`.
 * That order is what carries the palette's colour-vision-deficiency safety, and
 * the cap is where a categorical palette stops being readable — the schema
 * enforces the same limit, so this is a floor under a bad payload, not a policy.
 */
const SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function ChartMessagePart({
  part,
  sources,
  onSelectSource,
}: {
  part: ChartPart;
  sources: CitedSource[];
  onSelectSource: (source: CitedSource) => void;
}) {
  // While the call is still streaming its arguments the spec is a fragment —
  // half a `data` array, a series with no key. Validating rather than rendering
  // optimistically is what keeps a half-arrived chart from flashing wrong
  // numbers at the reader before it settles.
  const parsed = useMemo(() => chartSpecSchema.safeParse(part.input), [part.input]);

  if (!parsed.success) {
    return part.state === "input-streaming" || part.state === "input-available" ? (
      <ChartSkeleton />
    ) : (
      // The model produced something the schema rejects. Say so rather than
      // drawing a guess: a wrong chart is worse than no chart.
      <figure className="bg-card text-ink-03 my-4 rounded-xl border px-4 py-6 text-center text-xs">
        The chart data was incomplete.
      </figure>
    );
  }

  return (
    <Chart spec={parsed.data} sources={sources} onSelectSource={onSelectSource} />
  );
}

function Chart({
  spec,
  sources,
  onSelectSource,
}: {
  spec: ChartSpec;
  sources: CitedSource[];
  onSelectSource: (source: CitedSource) => void;
}) {
  const [showTable, setShowTable] = useState(false);

  // The model sends one point per value; a chart library wants one row per
  // category. Pivoted once here rather than inside the plot, which re-renders
  // on every hover.
  const rows = useMemo(() => toChartRows(spec), [spec]);

  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        spec.series.map((series, i) => [
          series.key,
          { label: series.label, color: SLOTS[i % SLOTS.length] },
        ]),
      ),
    [spec.series],
  );

  return (
    <figure className="bg-card my-4 rounded-xl border p-4">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The title states the finding; the subtitle says what it covers. */}
          <h4 className="text-ink-04 text-sm font-semibold">{spec.title}</h4>
          {spec.subtitle ? (
            <p className="text-ink-03 mt-0.5 text-xs">{spec.subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="muted"
            size="icon-sm"
            aria-label={showTable ? "Show the chart" : "Show the data as a table"}
            aria-pressed={showTable}
            onClick={() => setShowTable((open) => !open)}
          >
            <TableIcon />
          </Button>
          <CopyDataButton spec={spec} rows={rows} />
        </div>
      </figcaption>

      {showTable ? (
        <DataTable spec={spec} rows={rows} />
      ) : (
        <ChartContainer config={config} className="w-full">
          {renderPlot(spec, rows, config)}
        </ChartContainer>
      )}

      {/* Identity is never carried by colour alone: two or more series always
          get a legend. One series needs none — the title already names it. */}
      {spec.series.length > 1 ? (
        <Legend
          series={spec.series}
          sources={sources}
          onSelectSource={onSelectSource}
        />
      ) : (
        <SeriesCitations
          series={spec.series}
          sources={sources}
          onSelectSource={onSelectSource}
        />
      )}
    </figure>
  );
}

/**
 * Builds the plot for the requested form.
 *
 * Returns a single Recharts element because `ChartContainer` passes its child
 * straight to `ResponsiveContainer`, which accepts exactly one.
 */
function renderPlot(spec: ChartSpec, rows: ChartRow[], config: ChartConfig) {
  const axes = (
    <>
      {/* Hairline, solid, horizontal only. A vertical grid competes with the
          bars it sits behind and reads as ink that isn't data. */}
      <CartesianGrid vertical={false} strokeDasharray="0" />
      <XAxis
        dataKey="x"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={8}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={48}
        domain={[spec.yAxis?.min ?? "auto", spec.yAxis?.max ?? "auto"]}
        tickFormatter={(value: number) => formatValue(value, spec.yAxis?.suffix)}
      />
      <ChartTooltip
        cursor={false}
        content={
          <ChartTooltipContent
            formatter={(value, name) => (
              <TooltipRow
                label={config[String(name)]?.label ?? String(name)}
                value={formatValue(value, spec.yAxis?.suffix)}
                colorKey={String(name)}
              />
            )}
          />
        }
      />
      {spec.referenceLines?.map((line) => (
        <ReferenceLine
          key={`${line.value}-${line.label}`}
          y={line.value}
          // Dashed, because a threshold is an annotation rather than a reading
          // — the one place a dashed stroke belongs on a chart.
          strokeDasharray="4 4"
          stroke="var(--ink-02)"
          label={{
            value: line.label,
            position: "insideTopRight",
            fill: "var(--ink-03)",
            fontSize: 11,
          }}
        />
      ))}
    </>
  );

  switch (spec.type) {
    case "line":
      return (
        <LineChart data={rows} accessibilityLayer>
          {axes}
          {spec.series.map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              type="monotone"
              stroke={`var(--color-${series.key})`}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              // A dot per point is noise on a dense line, but the hover layer
              // still needs a target — hence one on hover only.
              dot={false}
              activeDot={{ r: DOT_RADIUS + 1, strokeWidth: 2 }}
              // A null is a gap in the data and is drawn as one.
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      );

    case "area":
      return (
        <AreaChart data={rows} accessibilityLayer>
          {axes}
          {spec.series.map((series) => (
            <Area
              key={series.key}
              dataKey={series.key}
              type="monotone"
              stackId={spec.stacked ? "stack" : undefined}
              stroke={`var(--color-${series.key})`}
              strokeWidth={LINE_WIDTH}
              fill={`var(--color-${series.key})`}
              fillOpacity={AREA_OPACITY}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );

    case "scatter":
      return (
        <ScatterChart accessibilityLayer>
          {axes}
          <ZAxis range={[DOT_RADIUS * DOT_RADIUS * 4, DOT_RADIUS * DOT_RADIUS * 4]} />
          {spec.series.map((series) => (
            <Scatter
              key={series.key}
              data={rows}
              dataKey={series.key}
              fill={`var(--color-${series.key})`}
              // The surface ring keeps overlapping points apart and widens the
              // hover target at the same time.
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      );

    case "pie": {
      // A pie splits one whole, so only the first series is plotted; slices
      // take the slots the series would have.
      const key = spec.series[0]?.key ?? "value";
      return (
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="x"
                formatter={(value, name) => (
                  <TooltipRow
                    label={String(name)}
                    value={formatValue(value, spec.yAxis?.suffix)}
                  />
                )}
              />
            }
          />
          <Pie
            data={rows}
            dataKey={key}
            nameKey="x"
            innerRadius="45%"
            outerRadius="80%"
            // The 2px gap in the surface colour is what separates the slices —
            // never a border drawn around each one.
            paddingAngle={1}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {rows.map((row, i) => (
              <Cell
                key={`${row.x}-${i}`}
                fill={SLOTS[i % SLOTS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      );
    }

    case "bar":
    default:
      return (
        <BarChart data={rows} accessibilityLayer barCategoryGap="20%">
          {axes}
          {spec.series.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              stackId={spec.stacked ? "stack" : undefined}
              fill={`var(--color-${series.key})`}
              maxBarSize={MAX_BAR_WIDTH}
              // Rounded at the data end, square on the baseline — except in a
              // stack, where every segment is an interior edge.
              radius={spec.stacked ? 0 : [4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      );
  }
}

/** A hovered value. Text wears text tokens; the swatch beside it carries identity. */
function TooltipRow({
  label,
  value,
  colorKey,
}: {
  label: React.ReactNode;
  value: string;
  colorKey?: string;
}) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="text-ink-03 flex items-center gap-1.5">
        {colorKey ? (
          <Swatch color={`var(--color-${colorKey})`} />
        ) : null}
        {label}
      </span>
      <span className="text-ink-04 font-mono tabular-nums">{value}</span>
    </span>
  );
}

/** The colour key beside a series name — identity, never carried by text. */
function Swatch({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden
      className="bg-(--swatch) size-2 shrink-0 rounded-xs"
      style={{ "--swatch": color } as CSSProperties}
    />
  );
}

function Legend({
  series,
  sources,
  onSelectSource,
}: {
  series: ChartSeries[];
  sources: CitedSource[];
  onSelectSource: (source: CitedSource) => void;
}) {
  return (
    <ul className="text-ink-03 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {series.map((entry, i) => (
        <li key={entry.key} className="flex items-center gap-1.5">
          <Swatch color={SLOTS[i % SLOTS.length]} />
          {entry.label}
          <SourceChip
            citation={entry.citation}
            sources={sources}
            onSelect={onSelectSource}
          />
        </li>
      ))}
    </ul>
  );
}

/** A single-series chart has no legend, but its provenance still has to show. */
function SeriesCitations({
  series,
  sources,
  onSelectSource,
}: {
  series: ChartSeries[];
  sources: CitedSource[];
  onSelectSource: (source: CitedSource) => void;
}) {
  const only = series[0];
  if (!only?.citation) return null;

  return (
    <p className="text-ink-03 mt-3 text-xs">
      Source
      <SourceChip
        citation={only.citation}
        sources={sources}
        onSelect={onSelectSource}
      />
    </p>
  );
}

/**
 * The `[n]` a series' numbers came from.
 *
 * This is what a rendered image cannot do: the reader can open the passage the
 * chart was built from instead of taking the bars on trust.
 */
function SourceChip({
  citation,
  sources,
  onSelect,
}: {
  citation: number | undefined;
  sources: CitedSource[];
  onSelect: (source: CitedSource) => void;
}) {
  if (citation === undefined) return null;
  const source = sources.find((candidate) => candidate.index === citation);
  // The model can cite a number retrieval never produced; showing a dead
  // button would be worse than showing nothing.
  if (!source) return null;

  return (
    <button
      type="button"
      onClick={() => onSelect(source)}
      title={source.title}
      aria-label={`Show the passage this series came from: ${source.title}`}
      className="bg-tint-02 text-ink-03 hover:bg-tint-03 hover:text-ink-04 ml-1
                 inline-flex size-4 items-center justify-center rounded align-middle
                 font-mono text-xs leading-none transition-colors"
    >
      {citation}
    </button>
  );
}

/**
 * The plotted numbers, readable.
 *
 * Not a nicety: slot 5 sits just under the 3:1 mark-contrast floor on the dark
 * surface, and a table view is the relief that makes that legal. It is also
 * what a screen reader and a copy-paste actually want.
 */
function DataTable({ spec, rows }: { spec: ChartSpec; rows: ChartRow[] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-card text-ink-03 sticky top-0">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              {spec.xLabel ?? ""}
            </th>
            {spec.series.map((series) => (
              <th key={series.key} scope="col" className="py-1.5 pr-3 font-medium">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink-04">
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              <th scope="row" className="py-1.5 pr-3 font-normal">
                {row.x}
              </th>
              {spec.series.map((series) => (
                <td
                  key={series.key}
                  className="py-1.5 pr-3 font-mono tabular-nums"
                >
                  {formatValue(row[series.key], spec.yAxis?.suffix)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Copies the plotted rows as CSV — the chart's data, not a picture of it. */
function CopyDataButton({ spec, rows }: { spec: ChartSpec; rows: ChartRow[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const header = [
      spec.xLabel ?? "category",
      ...spec.series.map((series) => series.label),
    ];
    const body = rows.map((row) => [
      row.x,
      ...spec.series.map((series) => row[series.key]),
    ]);
    const csv = [header, ...body]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is refusable and origin-dependent. The table view is
      // still there to select from, so failing quietly costs the reader nothing.
    }
  }

  return (
    <Button
      variant="muted"
      size="icon-sm"
      aria-label="Copy the chart data as CSV"
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

/** Quotes a CSV field only when it has to be — a bare number stays bare. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatValue(value: unknown, suffix?: string): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value !== "number") return String(value);
  // Clean numbers on the axis and in the table: thousands separated, and no
  // long float tail from a division the model did in its head.
  const rounded = Math.abs(value) < 1 ? value : Number(value.toFixed(2));
  return `${rounded.toLocaleString()}${suffix ?? ""}`;
}

/**
 * Holds the chart's place while the model is still emitting its rows.
 *
 * Sized to the same aspect as the plot so the prose underneath does not jump
 * when the real chart lands.
 */
function ChartSkeleton() {
  return (
    <figure className="bg-card my-4 rounded-xl border p-4" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-2 h-3 w-64" />
      <div className="mt-4 flex aspect-video w-full items-end gap-3">
        {["55%", "85%", "40%", "70%", "60%"].map((height, i) => (
          <Skeleton
            key={i}
            className="h-(--bar) w-full max-w-6"
            style={{ "--bar": height } as CSSProperties}
          />
        ))}
      </div>
      <span className="sr-only">Drawing chart…</span>
    </figure>
  );
}
