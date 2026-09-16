/**
 * The skills every workspace starts with.
 *
 * These are *seed definitions*, not runtime behaviour. Nothing reads them when
 * an answer is written: `ensureBuiltInSkills` copies them into `skill` rows the
 * first time a workspace needs them, and from that moment the row is the skill.
 * An admin edits the row, disables the row, and — if they want the original
 * back — `resetBuiltInSkill` writes the definition over the row again.
 *
 * The text has to live somewhere in code, because a workspace is created at
 * runtime and there is no migration that could have inserted rows for one that
 * does not exist yet. Keeping it here rather than in `@onirix/llm` is the point:
 * this is data for a table, and the prompt builder never sees it.
 */
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { Database } from "./index";
import { skill } from "./schema";

export type BuiltInSkillSeed = {
  /** Stable across renames and edits; what a row records in `built_in_id`. */
  id: string;
  name: string;
  description: string;
  instructions: string;
  loading: "always" | "on_demand";
  requiresContext?: boolean;
};

export const BUILT_IN_SKILL_SEEDS: readonly BuiltInSkillSeed[] = [
  {
    id: "grounding",
    name: "grounding",
    description:
      "How to separate the organization's own documents from inference and " +
      "general knowledge, and what to say when the documents do not answer.",
    loading: "always",
    instructions: `# Grounding
- Prefer the organization's own documents over your general knowledge when the \
question is about the organization.
- Make it clear which parts of an answer come from company sources, which are \
your inference, and which are general knowledge.
- If the supplied context does not answer the question, say so plainly and \
suggest what might be searched instead. Never invent a source, a policy, or a \
citation.
- If sources disagree, surface the disagreement instead of silently picking one.`,
  },
  {
    id: "citations",
    name: "citations",
    description:
      "How to cite the supplied documents inline, so every claim can be traced " +
      "back to the passage it came from.",
    loading: "always",
    // Sent only when documents were actually retrieved: telling a model how to
    // cite when it has nothing to cite invites a citation to a source that was
    // never supplied.
    requiresContext: true,
    instructions: `# Citations
CRITICAL: When referencing knowledge from the organization's documents, cite the \
relevant statements INLINE using the format [1], [2], [3], matching the "document" \
field of the supplied context. Cite as you go rather than collecting citations at \
the end, and do not append links after a citation.`,
  },
  {
    id: "response-style",
    name: "response-style",
    description:
      "How an answer is shaped: what comes first, how it is formatted, and how " +
      "long it runs.",
    loading: "always",
    instructions: `# Response style
- Answer the question directly first, then supply the supporting detail.
- Use Markdown: headings, lists, and tables where they aid readability.
- Be concise. Do not restate the question or pad the answer.`,
  },
  {
    id: "charts",
    name: "charts",
    description:
      "How to plot data with the render_chart tool: choosing a chart type, " +
      "citing the numbers, and what never to draw.",
    // Inlined rather than fetched on demand. The body is short, it applies to
    // any question with numbers in it, and a model that called `render_chart`
    // without having read it is the regression that put this in the prompt in
    // the first place.
    loading: "always",
    instructions: `# Charts
- When the answer compares a quantity across several entities, follows a value \
over time, or breaks a total into parts, call the \`render_chart\` tool rather \
than describing the shape of the data in prose. Never draw a chart out of text \
characters, block glyphs, or a Markdown table standing in for bars.
- Every number you plot must come from the supplied context. Do not estimate, \
interpolate, or invent a row to make a chart look complete: plot what you have, \
and say in the prose what is missing.
- Declare the series first, then send one point per plotted value, each naming \
the series it belongs to. Points arrive in the order the x axis is drawn, so \
send a time axis in chronological order. Omit a point you have no number for \
rather than sending a zero.
- Set \`citation\` on each series to the document index its numbers came from, \
the same index you would write inline as [1].
- When the question names a threshold, a target, or a cut-off, add it as a \
\`referenceLines\` entry so the chart answers the question rather than merely \
showing the data.
- Keep writing after the tool call. The chart supports your answer; it is not \
the answer, and it is never the whole of it.
- One chart per point. If a second measure is on a different scale, that is a \
second chart, not a second axis.`,
  },
];

const SEEDS_BY_ID = new Map(BUILT_IN_SKILL_SEEDS.map((seed) => [seed.id, seed]));

export function builtInSkillSeed(id: string): BuiltInSkillSeed | undefined {
  return SEEDS_BY_ID.get(id);
}

/**
 * Gives a workspace any built-in rows it does not have yet.
 *
 * Called before reading skills rather than once at workspace creation, which is
 * what makes it work for the two cases a creation hook misses: workspaces that
 * existed before skills did, and a built-in shipped in a later release. Both
 * pick it up on the next read.
 *
 * Idempotent and, in the normal case, free: the caller has usually just read the
 * rows, so passing them in means a workspace with nothing missing does no write
 * at all. An edited or disabled row counts as present — seeding must never
 * reinstate text an admin deliberately changed.
 */
export async function ensureBuiltInSkills(
  db: Database,
  organizationId: string,
  existingBuiltInIds?: readonly (string | null)[],
): Promise<boolean> {
  let present: Set<string>;

  if (existingBuiltInIds) {
    present = new Set(existingBuiltInIds.filter((id): id is string => id !== null));
  } else {
    const rows = await db
      .select({ builtInId: skill.builtInId })
      .from(skill)
      .where(eq(skill.organizationId, organizationId));
    present = new Set(
      rows.map((row) => row.builtInId).filter((id): id is string => id !== null),
    );
  }

  const missing = BUILT_IN_SKILL_SEEDS.filter((seed) => !present.has(seed.id));
  if (missing.length === 0) return false;

  await db
    .insert(skill)
    .values(
      missing.map((seed) => ({
        id: randomUUID(),
        organizationId,
        name: seed.name,
        description: seed.description,
        instructions: seed.instructions,
        loading: seed.loading,
        requiresContext: seed.requiresContext ?? false,
        builtInId: seed.id,
        enabled: true,
      })),
    )
    // Two requests for the same workspace can race here — a page load and a
    // question asked at the same moment. The unique index settles it; the loser
    // simply finds the rows already there.
    .onConflictDoNothing();

  return true;
}

/** Puts a seeded row back the way it shipped. */
export async function resetBuiltInSkill(
  db: Database,
  organizationId: string,
  builtInId: string,
): Promise<BuiltInSkillSeed | undefined> {
  const seed = SEEDS_BY_ID.get(builtInId);
  if (!seed) return undefined;

  await db
    .update(skill)
    .set({
      name: seed.name,
      description: seed.description,
      instructions: seed.instructions,
      loading: seed.loading,
      requiresContext: seed.requiresContext ?? false,
      enabled: true,
    })
    .where(
      and(eq(skill.organizationId, organizationId), eq(skill.builtInId, builtInId)),
    );

  return seed;
}
