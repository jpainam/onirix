/**
 * System prompts for grounded answering.
 *
 * Citation format follows Onyx: inline `[1]`, `[2]` markers keyed to the
 * `document` field of the supplied context, never trailing links.
 */

export type RetrievedContext = {
  /** 1-based citation number the model refers to. */
  document: number;
  title: string;
  sourceType: string;
  updatedAt: string | null;
  content: string;
};

export type AnswerPromptOptions = {
  organizationName: string;
  /** Extra instructions from an agent configuration, if one is in use. */
  agentInstructions?: string | null;
  hasContext: boolean;
  now?: Date;
};

const CITATION_GUIDANCE = `
CRITICAL: When referencing knowledge from the organization's documents, cite the \
relevant statements INLINE using the format [1], [2], [3], matching the "document" \
field of the supplied context. Cite as you go rather than collecting citations at \
the end, and do not append links after a citation.`;

/**
 * PRODUCT.md requires answers to distinguish what came from company sources,
 * what was inferred, and what is general knowledge — that distinction is the
 * basis for trusting the product, so it is stated as a hard rule.
 */
const GROUNDING_RULES = `
# Grounding
- Prefer the organization's own documents over your general knowledge when the \
question is about the organization.
- Make it clear which parts of an answer come from company sources, which are \
your inference, and which are general knowledge.
- If the supplied context does not answer the question, say so plainly and \
suggest what might be searched instead. Never invent a source, a policy, or a \
citation.
- If sources disagree, surface the disagreement instead of silently picking one.`;

const RESPONSE_STYLE = `
# Response style
- Answer the question directly first, then supply the supporting detail.
- Use Markdown: headings, lists, and tables where they aid readability.
- Be concise. Do not restate the question or pad the answer.`;

/**
 * Without this the model has no idea the chart tool exists as an option, and a
 * question like "show me attainment per rep" comes back as bars drawn out of
 * block characters — which is what it did before the tool was added.
 */
const CHART_GUIDANCE = `
# Charts
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
second chart, not a second axis.`;

export function buildSystemPrompt(options: AnswerPromptOptions): string {
  const now = (options.now ?? new Date()).toISOString().slice(0, 10);

  const sections = [
    `You are Onirix, the private AI assistant for ${options.organizationName}. \
You answer questions using that organization's own knowledge, and you are \
truthful, precise, and concise.`,
    `The current date is ${now}.`,
    options.hasContext ? CITATION_GUIDANCE : "",
    GROUNDING_RULES,
    RESPONSE_STYLE,
    CHART_GUIDANCE,
    options.agentInstructions
      ? `# Additional instructions\n${options.agentInstructions}`
      : "",
  ];

  return sections.filter(Boolean).join("\n\n").trim();
}

/** Renders retrieved chunks as the context block appended to the user's question. */
export function buildContextBlock(context: RetrievedContext[]): string {
  if (context.length === 0) {
    return "";
  }

  const rendered = context
    .map((entry) =>
      [
        `<document index="${entry.document}">`,
        `<title>${entry.title}</title>`,
        `<source>${entry.sourceType}</source>`,
        entry.updatedAt ? `<updated>${entry.updatedAt}</updated>` : "",
        `<content>`,
        entry.content,
        `</content>`,
        `</document>`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return `Here is the relevant context from ${
    context.length === 1 ? "one document" : `${context.length} documents`
  } in the organization's knowledge:\n\n${rendered}`;
}

/**
 * Rewrites a conversational question into a standalone search query.
 *
 * Follow-ups like "what about contractors?" carry their subject in the history,
 * so searching the raw text retrieves nothing useful.
 */
export const QUERY_REWRITE_PROMPT = `Given the conversation so far, rewrite the \
user's latest message as a standalone search query that will retrieve relevant \
company documents. Resolve pronouns and implied subjects from the conversation. \
Reply with the query text only, no preamble and no quotes.`;

/**
 * Contextual retrieval: a short blurb situating a chunk in its parent document,
 * prepended to the chunk before embedding so isolated chunks stay findable.
 */
export const CHUNK_CONTEXT_PROMPT = `Give a short, succinct context situating \
this chunk within the overall document, to improve search retrieval of the \
chunk. Answer with the context only and nothing else.`;

export const DOCUMENT_SUMMARY_PROMPT = `Give a short, succinct summary of the \
entire document. Answer with the summary only and nothing else.`;

/**
 * Names a conversation from its opening question.
 *
 * Sidebar width is the real constraint: a truncated question reads as a wall of
 * clipped text, so the model is pushed hard toward a few keywords. The language
 * instruction matters for a workspace whose documents are not in English — the
 * name should match the person who asked, not the documents that answered.
 */
export const CHAT_TITLE_PROMPT = `Give a SHORT name for a conversation that \
opens with the user's message. Focus on the keywords that convey the topic. \
Write the name in the same language as the user's message. Never use more than \
5 words — fewer is better. Reply with the name only: no quotes, no colons, no \
trailing punctuation, no preamble.`;
