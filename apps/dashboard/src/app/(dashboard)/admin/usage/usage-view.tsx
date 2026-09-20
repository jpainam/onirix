"use client";

/**
 * Usage: what the workspace asked, spent and indexed.
 *
 * Six numbers with their recent shape, and a breakdown of where the tokens
 * went. Every tile is the same encoding, a count per day over the selected
 * window, so they all wear the same colour and the same mark. Giving each
 * tile its own hue would suggest the six measure different kinds of thing,
 * and they do not: they measure the same workspace six ways.
 *
 * One range control sits above everything and scopes all of it, so no two
 * numbers on this page are ever describing different weeks.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CoinsIcon,
  MessageSquareIcon,
  PieChartIcon,
  QuoteIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "@onirix/ui/lib/icons";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@onirix/ui/components/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Skeleton } from "@onirix/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";
import { cn } from "@onirix/ui/lib/utils";

import { Notice, Page, PageHeader, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

const RANGES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;

type Range = (typeof RANGES)[number]["value"];

/**
 * Per-metric presentation the server has no opinion about.
 *
 * `polarity` is the one that matters: a delta is only allowed to be green when
 * up is actually good. Tokens are a bill, not an achievement, so their change
 * is reported in plain ink: a green "+38%" beside a spend figure tells the
 * reader the opposite of the truth.
 */
const PRESENTATION: Record<
  string,
  { icon: LucideIcon; unit: string; polarity: "up-good" | "neutral" }
> = {
  requests: { icon: MessageSquareIcon, unit: "requests", polarity: "up-good" },
  tokens: { icon: CoinsIcon, unit: "tokens", polarity: "neutral" },
  people: { icon: UsersIcon, unit: "people", polarity: "up-good" },
  conversations: { icon: SparklesIcon, unit: "conversations", polarity: "up-good" },
  citations: { icon: QuoteIcon, unit: "citations", polarity: "up-good" },
  documents: { icon: BookOpenIcon, unit: "documents", polarity: "up-good" },
};

/** One series, one colour, every tile. Slot 1, never cycled. */
const CHART_CONFIG = {
  value: { label: "Total", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Marks stay thin and the gap between them is surface, never a stroke. */
const BAR_GAP = 2;
const MAX_BAR_WIDTH = 24;

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Tile values are compact; the exact figure is a hover away and in the table. */
function compact(value: number) {
  return value < 1000 ? value.toLocaleString("en") : compactFormat.format(value);
}

function exact(value: number) {
  return value.toLocaleString("en");
}

/** `2026-09-15` as `15 Sep`, read as a UTC date so it never slips a day. */
function formatDay(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Metric = {
  key: string;
  label: string;
  description: string;
  total: number;
  previous: number;
  series: { date: string; value: number }[];
};

export function UsageView({ canRead }: { canRead: boolean }) {
  const [range, setRange] = useState<Range>("30d");

  const usage = useQuery(
    trpc.usage.summary.queryOptions(
      { range },
      {
        enabled: canRead,
        // Switching range must not empty the page and reflow it. The previous
        // window stays on screen, dimmed, until the new one has landed.
        placeholderData: (previous) => previous,
      },
    ),
  );

  const metrics = usage.data?.metrics ?? [];
  const [hero, ...rest] = metrics;
  const span = usage.data
    ? `${formatDay(usage.data.from.slice(0, 10))} to today`
    : null;

  const silent = useMemo(
    () => metrics.length > 0 && metrics.every((metric) => metric.total === 0),
    [metrics],
  );

  return (
    <Page>
      <PageHeader
        icon={PieChartIcon}
        title="Usage"
        description="What this workspace asked, spent and indexed."
        // One range control, in the masthead, scoping everything below it. A
        // per-tile range would let two numbers on the same screen describe
        // different weeks, which is the one thing a usage page cannot do.
        action={
          canRead ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                {RANGES.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={range === option.value ? "secondary" : "ghost"}
                    aria-pressed={range === option.value}
                    onClick={() => setRange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {span ? <span className="text-ink-03 text-xs">{span}</span> : null}
            </div>
          ) : undefined
        }
      />

      {!canRead ? (
        <Notice
          icon={PieChartIcon}
          title="You cannot see this workspace's usage"
          description="Usage is granted by role. Ask an owner for the Usage permission."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {usage.isPending ? (
            <LoadingTiles />
          ) : usage.isError ? (
            <Notice
              icon={PieChartIcon}
              title="Usage could not be loaded"
              description={usage.error.message}
            />
          ) : silent ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PieChartIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing recorded yet</EmptyTitle>
                <EmptyDescription>
                  Usage fills in as people ask questions and documents are indexed.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className={cn(
                "flex flex-col gap-10 transition-opacity",
                usage.isFetching && "opacity-60",
              )}
            >
              <div className="flex flex-col gap-4">
                {hero ? <Tile metric={hero} hero /> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {rest.map((metric) => (
                    <Tile key={metric.key} metric={metric} />
                  ))}
                </div>
              </div>

              <ModelBreakdown models={usage.data.models} />
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

/**
 * A stat tile: what it counts, how it changed, how big it is, and its shape.
 *
 * The hero is the one figure the page leads with and the only one set at
 * display size; the other five are the same tile at reading size, so the
 * hierarchy is carried by scale rather than by five different treatments.
 */
function Tile({ metric, hero = false }: { metric: Metric; hero?: boolean }) {
  const presentation = PRESENTATION[metric.key];
  const Icon = presentation?.icon ?? PieChartIcon;
  const unit = presentation?.unit ?? "";

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-ink-03 flex items-center gap-1.5 text-xs font-medium">
            <Icon className="size-3.5" />
            {metric.label}
          </span>
          <span className="text-ink-02 text-xs leading-4">{metric.description}</span>
        </div>
        <Delta
          total={metric.total}
          previous={metric.previous}
          polarity={presentation?.polarity ?? "neutral"}
        />
      </div>

      {/* Proportional figures, not tabular: at display size a tabular `1` sits
          in a column of whitespace and the number reads loose. */}
      <span
        className={cn(
          "font-semibold tracking-display",
          hero ? "text-5xl leading-none" : "text-3xl leading-none",
        )}
        title={exact(metric.total)}
      >
        {compact(metric.total)}
      </span>

      <Sparkline metric={metric} unit={unit} className={hero ? "h-28" : "h-16"} />
    </div>
  );
}

/**
 * The window's shape, one bar per day.
 *
 * Deliberately axis-less: the tile already carries the total and the filter row
 * already names the window, so ticks would repeat both and leave less room for
 * the only thing here that is not stated elsewhere. Every value stays reachable
 * on hover and on keyboard focus.
 */
function Sparkline({
  metric,
  unit,
  className,
}: {
  metric: Metric;
  unit: string;
  className: string;
}) {
  return (
    <ChartContainer config={CHART_CONFIG} className={cn("aspect-auto w-full", className)}>
      <BarChart
        accessibilityLayer
        data={metric.series}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap={BAR_GAP}
      >
        {/* A hairline baseline and nothing else: bars need somewhere to stand. */}
        <XAxis
          dataKey="date"
          tick={false}
          tickLine={false}
          height={4}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) =>
                formatDay(String(payload?.[0]?.payload?.date ?? ""))
              }
              formatter={(value) => (
                <span className="text-foreground text-xs font-medium tabular-nums">
                  {exact(Number(value))} {unit}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          // Square at the baseline, rounded at the data end. Kept to 2px rather
          // than the usual 4: at 90 days a bar is a few pixels wide, and a 4px
          // cap on it is a dome that reads taller than the value it draws.
          radius={[2, 2, 0, 0]}
          maxBarSize={MAX_BAR_WIDTH}
        />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Change against the window before this one.
 *
 * Always an arrow plus a signed number, never colour alone, and green only
 * where up is the direction a workspace wants. A window with no predecessor has
 * no percentage to report. "New" says that, where "+100%" would invent one.
 */
function Delta({
  total,
  previous,
  polarity,
}: {
  total: number;
  previous: number;
  polarity: "up-good" | "neutral";
}) {
  if (previous === 0) {
    if (total === 0) return null;
    return <Badge variant="muted">New</Badge>;
  }

  const change = ((total - previous) / previous) * 100;
  const rounded = Math.abs(change) < 0.05 ? 0 : change;
  const Icon =
    rounded > 0 ? ArrowUpRightIcon : rounded < 0 ? ArrowDownRightIcon : ArrowRightIcon;

  const tone =
    polarity === "neutral" || rounded === 0
      ? "muted"
      : rounded > 0
        ? "success"
        : "destructive";

  return (
    <Badge variant={tone} title={`${exact(previous)} in the previous period`}>
      <Icon data-icon="inline-start" />
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(1)}%
    </Badge>
  );
}

/**
 * Where the tokens went.
 *
 * The tiles say how much; this says on whose behalf. Only turns answered since
 * token counts were recorded appear, which is why an established workspace can
 * show a busy chart above an empty table for its first few days.
 */
function ModelBreakdown({
  models,
}: {
  models: { model: string; answers: number; inputTokens: number; outputTokens: number }[];
}) {
  if (models.length === 0) {
    return (
      <Section
        title="By model"
        description="Which model answered, and what each one spent."
      >
        <Notice
          icon={CoinsIcon}
          title="No token usage recorded in this window"
          description="Usage is recorded from the moment an answer finishes, so this fills in with the next question asked."
        />
      </Section>
    );
  }

  return (
    <Section
      title="By model"
      description="Which model answered, and what each one spent."
    >
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Answers</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((row) => (
              <TableRow key={row.model}>
                <TableCell variant="strong">{row.model}</TableCell>
                {/* `figure` is the table's own numeric treatment: mono, tabular,
                    so four columns of counts line up down the page. */}
                <TableCell variant="figure" className="text-right">
                  {exact(row.answers)}
                </TableCell>
                <TableCell variant="figure" className="text-right">
                  {exact(row.inputTokens)}
                </TableCell>
                <TableCell variant="figure" className="text-right">
                  {exact(row.outputTokens)}
                </TableCell>
                <TableCell variant="figure" className="text-right">
                  {exact(row.inputTokens + row.outputTokens)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

function LoadingTiles() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-52 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
