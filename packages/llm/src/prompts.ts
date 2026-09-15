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
