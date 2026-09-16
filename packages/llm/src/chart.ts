/**
 * The chart contract.
 *
 * A model that wants to plot something does not write drawing code — it fills
 * in this shape and the client renders it. That is the whole design:
 *
 *   - the schema is closed, so a malformed chart is rejected rather than drawn
 *     wrong, and every chart in the product looks like every other one;
 *   - the numbers travel as data, so the reader can hover them, read them in a
 *     table, and export them, none of which survives a rendered image;
 *   - it costs no sandbox and no code execution against a workspace's private
 *     documents.
 *
 * Shared by the server (which registers the tool) and the client (which draws
 * the result), so the two cannot drift.
 */
import { tool } from "ai";
import { z } from "zod";

/** Slots in `--chart-1..5`. Past this a chart is unreadable, not just crowded. */
export const MAX_SERIES = 5;

/**
 * Points, not rows: a year of months across four series is 48. Past this the
 * marks are thinner than the gaps between them and the answer wants a table or
 * an aggregate instead.
 */
export const MAX_POINTS = 300;

/**
 * One plotted value.
 *
 * Long format — a row per point rather than a row per category with a field per
 * series — because it is the only shape that survives every provider. A record
 * keyed by series name compiles to `propertyNames` and an open
 * `additionalProperties`, which Gemini's function-declaration subset rejects
 * outright and OpenAI's strict mode disallows; nullable and union types fare
 * little better. Everything here is a required scalar, so the same tool
 * definition works on OpenAI, Anthropic, Google and xAI without a per-provider
 * dialect. A gap in the data is simply a point that is not sent.
 */
const pointSchema = z.object({
  /** The category or x position this value sits at, exactly as it should be labelled. */
  x: z.string().min(1).max(80),
  /** Which series this belongs to — one of the `key` values declared below. */
  series: z.string().min(1),
  value: z.number(),
});

export const chartSpecSchema = z.object({
  /**
   * Chosen for the job the data does, not for variety: `bar` compares
   * magnitudes across entities, `line` follows a value over an ordered axis,
   * `area` does the same for a cumulative total, `pie` splits one whole into a
   * handful of parts, `scatter` relates two measures.
   */
  type: z.enum(["bar", "line", "area", "pie", "scatter"]),
  /** States the chart's finding, not its mechanics: "Two reps are below target". */
  title: z.string().min(1).max(120),
  /** Where the numbers came from and what they cover. */
  subtitle: z.string().max(200).optional(),
  /** What the categories are — "Collaborateur", "Month". Names the table column too. */
  xLabel: z.string().max(60).optional(),
  series: z
    .array(
      z.object({
        /** Referred to by each point's `series`. */
        key: z.string().min(1),
        /** What the legend and tooltip call it. */
        label: z.string().min(1),
        /**
         * The `[n]` this series' numbers came from. Carrying provenance per
         * series is why a chart here can be audited and a pasted image cannot.
         */
        citation: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(MAX_SERIES),
  /**
   * The plotted values. Every number must come from the supplied context, and
   * the order points arrive in is the order the x axis is drawn in.
   */
  points: z.array(pointSchema).min(1).max(MAX_POINTS),
  /** Unit and range. Omit `min`/`max` unless the data genuinely needs a fixed scale. */
  yAxis: z
    .object({
      label: z.string().max(60).optional(),
      /** Appended to every value, e.g. "%", " h", " €". */
      suffix: z.string().max(8).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  /**
   * Horizontal markers — a target, a threshold, an average. When the question
   * names a cut-off ("who is below 85%?"), drawing it is the difference between
   * a chart that answers the question and one that merely shows the data.
   */
  referenceLines: z
    .array(z.object({ value: z.number(), label: z.string().max(60) }))
    .max(3)
    .optional(),
  /** Bars and areas only, and only when the parts genuinely sum to a whole. */
  stacked: z.boolean().optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSeries = ChartSpec["series"][number];
export type ChartPoint = ChartSpec["points"][number];

/** A category and its value per series — what a chart library wants to plot. */
export type ChartRow = { x: string } & Record<string, string | number>;

/**
 * Pivots the long-format points into one row per category.
 *
 * Categories keep the order the model sent them in: for a time axis that order
 * is the story, and re-sorting alphabetically would turn "Jan, Feb, Mar" into
 * "Feb, Jan, Mar". A point naming a series that was never declared is dropped
 * rather than drawn under a made-up label.
 */
export function toChartRows(spec: ChartSpec): ChartRow[] {
  const known = new Set(spec.series.map((series) => series.key));
  const byX = new Map<string, ChartRow>();

  for (const point of spec.points) {
    if (!known.has(point.series)) continue;

    let row = byX.get(point.x);
    if (!row) {
      row = { x: point.x };
      byX.set(point.x, row);
    }
    row[point.series] = point.value;
  }

  return [...byX.values()];
}

/** Named once so the server registration and the client's `tool-…` part cannot disagree. */
export const CHART_TOOL_NAME = "render_chart";

/**
 * The tool as the model sees it.
 *
 * `execute` does no work: the call's *input* is the chart, and the client draws
 * it straight from the streaming tool part — so a chart starts appearing while
 * the model is still emitting its points. The returned acknowledgement exists
 * only to close the tool loop so the model goes on to write the prose around
 * the chart.
 */
export const chartTool = tool({
  description: [
    "Render a chart in the conversation. Call this whenever the answer compares",
    "quantities across several entities, follows a value over time, or breaks a",
    "total into parts — instead of describing the shape of the data in prose or",
    "drawing bars out of text characters. Declare the series, then send one",
    "point per plotted value, each naming the series it belongs to. Every number",
    "must come from the supplied context, and each series should carry the",
    "citation index it came from. Then continue your written answer: the chart",
    "supports the point, it does not replace it.",
  ].join(" "),
  inputSchema: chartSpecSchema,
  execute: async () => ({ rendered: true }),
});
