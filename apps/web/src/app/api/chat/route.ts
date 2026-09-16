/**
 * Grounded chat.
 *
 * Retrieves from the organization's knowledge, answers with inline citations,
 * and persists the answer together with the sources it actually cited.
 *
 * An answer is a sequence of parts, not a string: prose, and charts the model
 * drew by calling `render_chart`. The whole sequence is persisted, so reopening
 * a conversation shows the same interleaving of text and charts it had live.
 *
 * Generation is driven by a resumable stream rather than by the HTTP response.
 * The response is one reader of that stream; losing it — a refresh, a closed
 * laptop, a dropped connection — neither stops the model nor costs the reader
 * the answer, which they re-attach to through `GET /api/chat/[id]/stream`.
 */
import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
} from "ai";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { chat, citation, message } from "@onirix/db/schema";
import {
  DEFAULT_CONTEXT_CHUNKS,
  extractCitedIndices,
  retrieveContext,
} from "@onirix/ingestion";
import {
  CHART_TOOL_NAME,
  CHAT_TITLE_PROMPT,
  QUERY_REWRITE_PROMPT,
  buildContextBlock,
  buildSystemPrompt,
  chartTool,
  createChatModel,
  modelReasons,
  reasoningEffortOptions,
  type ProviderCredentials,
  type ReasoningProviderOptions,
} from "@onirix/llm";
import type { SearchHit } from "@onirix/search";

import { isChartPart } from "@/lib/chat-message";
import type { CitedSource, OnirixUIMessage } from "@/lib/chat-message";
import { clearActiveStream, markStreamActive } from "@/lib/chat-stream";
import { fallbackTitle, sanitizeTitle } from "@/lib/chat-title";
import { loadWorkspace, providerCredentials } from "@/lib/workspace";
import { auth, getDb, getDocumentIndex, getResumableStreamContext } from "@/services";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as {
    messages: OnirixUIMessage[];
    chatId?: string;
  };
  const workspace = await loadWorkspace(
    session.user.id,
    session.session.activeOrganizationId,
  );

  if (!workspace) {
    return Response.json({ error: "You do not belong to an organization." }, { status: 403 });
  }
  if (!workspace.llmConfig) {
    return Response.json(
      { error: "This workspace has no model configured yet." },
      { status: 412 },
    );
  }

  const db = getDb();
  const config = workspace.llmConfig;

  // Keys belong to the connected provider, not to the default model, and they
  // are the workspace's own: nothing here reads the deployment environment.
  const chatCredentials: ProviderCredentials = {
    provider: config.chatProvider as ProviderCredentials["provider"],
    ...providerCredentials(workspace, config.chatProvider),
  };
  const embeddingCredentials: ProviderCredentials = {
    provider: config.embeddingProvider as ProviderCredentials["provider"],
    apiKey: config.embeddingApiKey,
    baseUrl: config.embeddingBaseUrl,
  };

  const model = createChatModel(chatCredentials, config.chatModel);

  // Reasoning is what a reader experiences as the wait before an answer starts,
  // and neither of the two things Onirix asks a model to do here needs much of
  // it. The secondary flows get none: rewriting a query and naming a
  // conversation are one-line transformations of text already in hand. The
  // answer gets a little: retrieval has already found the passages, so the
  // model is summarizing and citing rather than working the answer out.
  const noReasoning = reasoningEffortOptions(chatCredentials, config.chatModel, "off");
  const answerReasoning = reasoningEffortOptions(chatCredentials, config.chatModel, "low");

  // Turned down is not turned off, and on most providers the tokens a model
  // spends thinking come out of the same budget as the ones it writes. Both
  // secondary flows cap that budget tightly and treat an empty result as a
  // failure they fall back from without saying so — so a model that thought
  // through its whole allowance would quietly stop rewriting queries and
  // naming conversations at all. This is the room it needs to do both.
  const thinkingHeadroom = modelReasons(chatCredentials.provider, config.chatModel)
    ? 256
    : 0;

  const latest = body.messages.at(-1);
  const question = extractText(latest);

  if (!question.trim()) {
    return Response.json({ error: "Empty message." }, { status: 400 });
  }

  const chatId = body.chatId ?? null;
  // Ownership is settled before anything is generated: a turn that cannot be
  // persisted has no business naming a conversation either.
  const conversation = chatId
    ? await db.query.chat.findFirst({
        where: and(
          eq(chat.id, chatId),
          eq(chat.organizationId, workspace.organizationId),
          eq(chat.userId, session.user.id),
        ),
      })
    : null;

  // The question is stored before a single token is generated rather than with
  // the answer at the end. A reader who refreshes mid-answer reloads the
  // conversation from the database, and a turn that only appeared once it had
  // finished would leave them looking at an answer to a question that is not
  // there.
  //
  // It is not awaited here, though. Nothing between this point and the answer
  // reads the row, so holding up retrieval for a local write only adds to the
  // wait; it is settled before the turn is persisted instead. `execute` is what
  // starts it — a Drizzle query builder is lazy, and one that were only awaited
  // later would not have run in the meantime, which is the whole point.
  const questionStored = conversation
    ? db
        .insert(message)
        .values({
          id: randomUUID(),
          chatId: conversation.id,
          role: "user",
          content: question,
        })
        .execute()
    : null;
  // The failure is reported where the promise is awaited, at the end of the
  // turn. This only marks it handled in the meantime, so a write that fails
  // early does not take the process down as an unhandled rejection.
  void questionStored?.catch(() => {});

  // Naming runs alongside retrieval and generation rather than after them. The
  // name is not needed until the answer is persisted, by which point this has
  // long since settled — so a second model call costs the reader nothing. Only
  // an unnamed conversation gets one; a name the user typed is never replaced.
  const titlePromise =
    conversation && conversation.title === null
      ? generateTitle(model, question, noReasoning, thinkingHeadroom)
      : null;

  // A follow-up like "what about contractors?" carries its subject in the
  // history, so search the rewritten query rather than the raw text.
  const searchQuery =
    body.messages.length > 1
      ? await rewriteQuery(model, body.messages, question, noReasoning, thinkingHeadroom)
      : question;

  const index = getDocumentIndex(config.embeddingModel, Number(config.embeddingDimension));

  const { hits, context } = await retrieveContext({
    queryText: searchQuery,
    // The only filter retrieval gets. Everything the model is allowed to read
    // is decided here, before a single token is generated — an answer cannot
    // cite what was never retrieved.
    filters: {
      organizationId: workspace.organizationId,
      accessControlList: workspace.accessControlList,
    },
    limit: DEFAULT_CONTEXT_CHUNKS,
    index,
    embeddingCredentials,
    embeddingModelId: config.embeddingModel,
  });

  const contextBlock = buildContextBlock(context);

  // Retrieved context goes in the system field, not as a system-role message:
  // the AI SDK rejects system messages inside `messages`. The prompt is rebuilt
  // from fresh retrieval each turn, so nothing accumulates in history.
  const systemPrompt = [
    buildSystemPrompt({
      organizationName: workspace.organizationName,
      hasContext: context.length > 0,
    }),
    contextBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelMessages = await convertToModelMessages(body.messages);

  const sources = toCitedSources(hits);

  // Named up front because both the response and `onFinish` have to agree on
  // which stream a reconnecting client is being pointed at.
  const streamId = randomUUID();

  const stream = createUIMessageStream<OnirixUIMessage>({
    // Passed so the SDK can tell a fresh answer from a continuation, which is
    // what makes `responseMessage` in `onFinish` the assistant's turn alone.
    originalMessages: body.messages,
    execute: ({ writer }) => {
      // Sent before the first token so a `[1]` is resolvable the moment it is
      // rendered. All retrieved chunks go over, not just the cited ones: which
      // ones the model cites is only known once the text exists.
      if (sources.length > 0) {
        writer.write({ type: "data-sources", id: "sources", data: sources });
      }

      writer.merge(
        streamText({
          model,
          system: systemPrompt,
          messages: modelMessages,
          tools: { [CHART_TOOL_NAME]: chartTool },
          providerOptions: answerReasoning,
          // A chart is drawn from the tool call's input, so the call itself
          // produces no prose. Without a second step the turn would end on the
          // chart and the reader would get a picture with nothing said about
          // it; three leaves room for a second chart before the commentary.
          stopWhen: stepCountIs(3),
        }).toUIMessageStream<OnirixUIMessage>(),
      );
    },
    // Persistence hangs off the UI stream rather than `streamText` because only
    // here is the answer assembled into ordered parts. Taking the text alone
    // would drop every chart the turn drew.
    onFinish: async ({ responseMessage }) => {
      if (!conversation) return;
      try {
        // The question's own write, started before generation, has to have
        // landed before the answer is stored beside it.
        await questionStored;
        await persistTurn({
          db,
          chatId: conversation.id,
          answer: responseMessage,
          sources,
          title: titlePromise ? await titlePromise : null,
        });
      } catch (error) {
        // A persistence failure must not break the user's stream; the answer
        // has already been delivered.
        console.error("Failed to persist chat turn", error);
      }
      // The turn has landed, so a reader arriving now should be served the
      // stored conversation rather than sent to re-attach to a stream with
      // nothing left to give.
      await clearActiveStream(conversation.id);
    },
  });

  // A turn with no conversation behind it cannot be persisted and so has
  // nothing to resume into; it streams straight to the one reader it has.
  if (!conversation) {
    return createUIMessageStreamResponse({ stream });
  }

  // Registered before the response is handed back so the pointer is already in
  // place if the reader reconnects on the very next tick.
  await markStreamActive(conversation.id, streamId);

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream: sseStream }) => {
      // This is what makes generation outlive the request. The response and
      // the resumable context each read their own copy of the stream, and the
      // context reads its copy to the end whether or not anyone is still
      // listening to the other one — so a disconnect costs the reader their
      // connection, not their answer.
      getResumableStreamContext()
        .createNewResumableStream(streamId, () => sseStream)
        // Registering the stream is what makes it recoverable, not what makes
        // it run: the response already holds its own copy. A failure here —
        // Redis unreachable — must be reported and dropped rather than left to
        // surface as an unhandled rejection.
        .catch((error: unknown) => {
          console.error("Failed to register a resumable chat stream", error);
        });
    },
  });
}

/**
 * Shapes retrieved chunks into the citation records the client renders.
 *
 * The index matches the `document` field the prompt exposes to the model, so
 * `[1]` in the answer resolves to the first entry here.
 */
function toCitedSources(hits: SearchHit[]): CitedSource[] {
  return hits.map((hit, i) => ({
    index: i + 1,
    documentId: hit.document_id,
    title: hit.title ?? hit.semantic_identifier,
    sourceType: hit.source_type,
    updatedAt: hit.last_updated
      ? new Date(hit.last_updated * 1000).toISOString().slice(0, 10)
      : null,
    passage: hit.content,
    url: firstSourceLink(hit.source_links),
  }));
}

/**
 * `source_links` maps a character offset inside the chunk to the link covering
 * it. The lowest offset is the closest thing to a link for the chunk as a
 * whole, so that is what a citation points at.
 */
function firstSourceLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const links = JSON.parse(raw) as Record<string, string>;
    const offsets = Object.keys(links)
      .map(Number)
      .filter((offset) => Number.isFinite(offset))
      .sort((a, b) => a - b);
    const first = offsets[0];
    return first === undefined ? null : (links[String(first)] ?? null);
  } catch {
    // A malformed link map must not cost the user their citation.
    return null;
  }
}

function extractText(uiMessage: OnirixUIMessage | undefined): string {
  if (!uiMessage) return "";
  return uiMessage.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

async function rewriteQuery(
  model: Parameters<typeof generateText>[0]["model"],
  messages: OnirixUIMessage[],
  fallback: string,
  providerOptions: ReasoningProviderOptions,
  thinkingHeadroom: number,
): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      system: QUERY_REWRITE_PROMPT,
      // Recent turns only; the whole history is unnecessary and costly.
      messages: await convertToModelMessages(messages.slice(-6)),
      // This call sits directly in front of retrieval, so every token it is
      // allowed costs the reader wait. A search query is a phrase; a model that
      // wants more than this is writing prose the embedder does not need.
      maxOutputTokens: 64 + thinkingHeadroom,
      providerOptions,
    });
    return text.trim() || fallback;
  } catch {
    // Rewriting is an optimization. If it fails, search the raw question.
    return fallback;
  }
}

/**
 * Names a conversation from its opening question.
 *
 * The answer is deliberately not part of the input. A grounded workspace
 * question carries its own topic, and waiting for the answer would put this
 * call in series with generation rather than alongside it.
 */
async function generateTitle(
  model: Parameters<typeof generateText>[0]["model"],
  question: string,
  providerOptions: ReasoningProviderOptions,
  thinkingHeadroom: number,
): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      system: CHAT_TITLE_PROMPT,
      prompt: question,
      // Five words and a little slack. A model that needs more than this is
      // writing a sentence, which `sanitizeTitle` rejects anyway.
      maxOutputTokens: 32 + thinkingHeadroom,
      providerOptions,
    });
    return sanitizeTitle(text) ?? fallbackTitle(question);
  } catch {
    // Naming is cosmetic, and this runs concurrently with the answer: a
    // rejection here must never reach the stream.
    return fallbackTitle(question);
  }
}

/**
 * The parts of an answer worth storing, in the order they were produced.
 *
 * `data-sources` is dropped: it is rebuilt from the citation rows on reload,
 * and keeping both would let the two copies disagree. A chart is kept only once
 * its call has completed: a half-arrived one has no data to draw, and a tool
 * call without its result is rejected outright when the restored history is
 * converted back into model messages on the next turn.
 */
function storableParts(answer: OnirixUIMessage): OnirixUIMessage["parts"] {
  return answer.parts.filter((part) => {
    if (part.type === "data-sources") return false;
    if (part.type === "text") return part.text.trim().length > 0;
    if (isChartPart(part)) return part.state === "output-available";
    // Step boundaries and anything else the SDK emits for its own bookkeeping
    // are not part of what the reader saw.
    return false;
  });
}

/** The citation indices attached to the series of any chart in the answer. */
function chartCitations(parts: OnirixUIMessage["parts"]): number[] {
  return parts.flatMap((part) => {
    if (!isChartPart(part)) return [];
    const series = (part.input as { series?: { citation?: number }[] } | undefined)
      ?.series;
    if (!Array.isArray(series)) return [];
    return series
      .map((entry) => entry?.citation)
      .filter((index): index is number => typeof index === "number");
  });
}

/**
 * Stores the answer half of a turn. The question was written before generation
 * started, so that it survives a reader who leaves mid-answer.
 */
async function persistTurn(args: {
  db: ReturnType<typeof getDb>;
  chatId: string;
  answer: OnirixUIMessage;
  sources: CitedSource[];
  /** Null once the conversation has a name, generated or typed. */
  title: string | null;
}) {
  const { db, chatId, sources } = args;
  const parts = storableParts(args.answer);
  const answer = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  const assistantMessageId = randomUUID();
  await db.insert(message).values({
    id: assistantMessageId,
    chatId,
    role: "assistant",
    // The prose alone. Everything that reads a message as a string — citation
    // extraction here, the conversation list, search over history — keeps
    // working unchanged; `parts` is what carries the charts.
    content: answer,
    parts,
  });

  // Store only the sources the model actually cited. Retrieval returns more
  // context than gets used, and listing all of it would misstate the basis of
  // the answer. A chart's series carry citations too, and a document the model
  // only plotted is just as much the basis of the answer as one it quoted.
  const cited = [
    ...new Set([...extractCitedIndices(answer), ...chartCitations(parts)]),
  ].sort((a, b) => a - b);
  if (cited.length > 0) {
    const rows = cited
      .map((citationIndex) => {
        const source = sources[citationIndex - 1];
        if (!source) return null;
        return {
          id: randomUUID(),
          messageId: assistantMessageId,
          index: citationIndex,
          documentId: source.documentId,
          passage: source.passage.slice(0, 2000),
          documentTitle: source.title,
          sourceUrl: source.url,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      await db.insert(citation).values(rows);
    }
  }

  // Written here rather than the moment it was generated so the name and the
  // exchange it describes land together.
  if (args.title) {
    await db.update(chat).set({ title: args.title }).where(eq(chat.id, chatId));
  }
}
