/**
 * The wire shape of a chat turn.
 *
 * Retrieval happens on the server, but PRODUCT.md requires a reader to inspect
 * the passage behind every `[1]`, so the sources travel to the client as a
 * typed data part alongside the answer text rather than being thrown away.
 */
import type { InferUITools, UIMessage } from "ai";

import type { chartTool } from "@onirix/llm/chart";
import type {
  createDescribeTablesTool,
  createQueryDatabaseTool,
  createRunSavedQueryTool,
} from "@onirix/llm/database";
import type { createLoadSkillTool } from "@onirix/llm/skills";

export type CitedSource = {
  /** 1-based number the model writes inline, e.g. 1 for `[1]`. */
  index: number;
  documentId: string;
  title: string;
  sourceType: string;
  /** ISO date (YYYY-MM-DD) of the document's last update, when known. */
  updatedAt: string | null;
  /** The retrieved chunk — what the answer was actually grounded in. */
  passage: string;
  /** Link to the document in its originating system, when it has one. */
  url: string | null;
};

export type ChatDataParts = {
  sources: CitedSource[];
};

/**
 * Derived from the tool definition rather than restated, so the day the chart
 * schema gains a field the renderer fails to compile instead of silently
 * dropping it. The import is type-only: none of `@onirix/llm` reaches the
 * client bundle.
 */
export type ChatTools = InferUITools<{
  render_chart: typeof chartTool;
  // A factory rather than a constant, because the skills belong to a workspace.
  // The return type does not depend on the argument's value, so the inferred
  // part type is the same on every request — which is what the client needs.
  load_skill: ReturnType<typeof createLoadSkillTool>;
  // Same shape on every request for the same reason: the databases vary, the
  // tool's input and output types do not.
  query_database: ReturnType<typeof createQueryDatabaseTool>;
  describe_tables: ReturnType<typeof createDescribeTablesTool>;
  run_saved_query: ReturnType<typeof createRunSavedQueryTool>;
}>;

/**
 * The streamed part a database read arrives as: the model's own SQL, or a
 * saved query it called by name. Both return the same output shape and the
 * client draws them through one component.
 */
export type DatabaseQueryPart = Extract<
  OnirixUIMessage["parts"][number],
  { type: "tool-query_database" | "tool-run_saved_query" }
>;

export function isDatabaseQueryPart(
  part: OnirixUIMessage["parts"][number],
): part is DatabaseQueryPart {
  return part.type === "tool-query_database" || part.type === "tool-run_saved_query";
}

/** The streamed part a `describe_tables` call arrives as. Machinery, never drawn. */
export function isDescribeTablesPart(part: OnirixUIMessage["parts"][number]): boolean {
  return part.type === "tool-describe_tables";
}

/** The streamed part a `load_skill` call arrives as. */
export type SkillPart = Extract<
  OnirixUIMessage["parts"][number],
  { type: "tool-load_skill" }
>;

export function isSkillPart(
  part: OnirixUIMessage["parts"][number],
): part is SkillPart {
  return part.type === "tool-load_skill";
}

export type OnirixUIMessage = UIMessage<unknown, ChatDataParts, ChatTools>;

/** The streamed part a `render_chart` call arrives as. */
export type ChartPart = Extract<
  OnirixUIMessage["parts"][number],
  { type: "tool-render_chart" }
>;

export function isChartPart(
  part: OnirixUIMessage["parts"][number],
): part is ChartPart {
  return part.type === "tool-render_chart";
}

/**
 * The inline marker the model writes, e.g. `[1]`.
 *
 * Bounded to three digits so a year or an identifier in the prose never reads
 * as a citation. Always used with `matchAll`, which works on a copy and so
 * keeps no state on this shared pattern.
 */
export const CITATION_MARKER = /\[(\d{1,3})\]/g;

export function getMessageText(message: OnirixUIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Everything retrieved for a turn, cited or not. */
export function getRetrievedSources(message: OnirixUIMessage): CitedSource[] {
  for (const part of message.parts) {
    if (part.type === "data-sources") return part.data;
  }
  return [];
}

/**
 * Every citation index an answer leaned on, whether it wrote it inline or
 * attached it to a chart series.
 *
 * A chart is grounded the same way a sentence is, so a document the model only
 * plotted still belongs in the answer's source list — otherwise the numbers in
 * the chart would be the one part of the answer with no stated basis.
 */
export function getCitedIndices(message: OnirixUIMessage): number[] {
  const cited = new Set<number>();

  for (const match of getMessageText(message).matchAll(CITATION_MARKER)) {
    const value = match[1];
    if (value) cited.add(Number.parseInt(value, 10));
  }

  for (const part of message.parts) {
    if (!isChartPart(part)) continue;
    const series = (part.input as { series?: { citation?: number }[] } | undefined)
      ?.series;
    if (!Array.isArray(series)) continue;
    for (const entry of series) {
      if (typeof entry?.citation === "number") cited.add(entry.citation);
    }
  }

  return [...cited].sort((a, b) => a - b);
}

/**
 * The sources an answer actually leaned on, in citation order.
 *
 * Retrieval sends over more context than the model uses, and listing all of it
 * would misstate the basis of the answer.
 */
export function getCitedSources(message: OnirixUIMessage): CitedSource[] {
  const retrieved = getRetrievedSources(message);
  if (retrieved.length === 0) return [];

  const byIndex = new Map(retrieved.map((source) => [source.index, source]));

  return getCitedIndices(message)
    .map((index) => byIndex.get(index))
    .filter((source): source is CitedSource => source !== undefined);
}

