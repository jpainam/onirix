/**
 * The frame around a grounded answer.
 *
 * What is left here is only what cannot sensibly be edited: who the assistant
 * is, what day it is, and the shape of the retrieved context block. How to
 * answer — grounding, citations, response style, charts — lives in
 * `skills.ts` as built-in skills, which a workspace can rewrite.
 *
 * Citation format follows Onyx: inline `[1]`, `[2]` markers keyed to the
 * `document` field of the supplied context, never trailing links. That contract
 * is shared with `extractCitedIndices` and the client's citation renderer, so
 * the `citations` skill is the one whose text has consequences beyond the
 * prose: rewriting it away from `[n]` markers costs the answer its citations.
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
  /** Bodies of the skills that load `always`, from `buildSkillSections`. */
  inlinedSkills?: string;
  /** Names and descriptions of the skills the model may fetch on demand. */
  skillCatalog?: string;
  /** The databases the caller may query, from `buildDatabaseSection`. */
  databaseCatalog?: string;
  now?: Date;
};

export function buildSystemPrompt(options: AnswerPromptOptions): string {
  const now = (options.now ?? new Date()).toISOString().slice(0, 10);

  const sections = [
    `You are Onirix, the private AI assistant for ${options.organizationName}. \
You answer questions using that organization's own knowledge, and you are \
truthful, precise, and concise.`,
    `The current date is ${now}.`,
    // Everything about how to answer now arrives here. Grounding, citations,
    // response style and charts were all string constants in this file; they are
    // built-in skills now, so the same text reaches the model by a route an
    // admin can read, edit and add to without a deploy.
    options.inlinedSkills ?? "",
    options.skillCatalog ?? "",
    options.databaseCatalog ?? "",
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
