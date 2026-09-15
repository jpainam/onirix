/**
 * Grounded chat.
 *
 * Retrieves from the organization's knowledge, answers with inline citations,
 * and persists the answer together with the sources it actually cited.
 */
import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  type UIMessage,
} from "ai";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { chat, citation, message } from "@onirix/db/schema";
import {
  DEFAULT_CONTEXT_CHUNKS,
  extractCitedIndices,
  retrieveContext,
} from "@onirix/ingestion";
import {
  QUERY_REWRITE_PROMPT,
  buildContextBlock,
  buildSystemPrompt,
  createChatModel,
  resolveCredentials,
  type ProviderCredentials,
} from "@onirix/llm";
import type { SearchHit } from "@onirix/search";

import { env } from "@/env.server";
import type { CitedSource, OnirixUIMessage } from "@/lib/chat-message";
import { loadWorkspace } from "@/lib/workspace";
import { auth, getDb, getDocumentIndex } from "@/services";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { messages: UIMessage[]; chatId?: string };
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

  // A workspace using a deployment-provided key stores null; fill it in here so
  // the secret stays in one place.
  const serverEnv = env as unknown as Record<string, string | undefined>;
  const chatCredentials: ProviderCredentials = resolveCredentials(
    {
      provider: config.chatProvider as ProviderCredentials["provider"],
      apiKey: config.chatApiKey,
      baseUrl: config.chatBaseUrl,
    },
    serverEnv,
  );
  const embeddingCredentials: ProviderCredentials = resolveCredentials(
    {
      provider: config.embeddingProvider as ProviderCredentials["provider"],
      apiKey: config.embeddingApiKey,
      baseUrl: config.embeddingBaseUrl,
    },
    serverEnv,
  );

  const model = createChatModel(chatCredentials, config.chatModel);
  const latest = body.messages.at(-1);
  const question = extractText(latest);

  if (!question.trim()) {
    return Response.json({ error: "Empty message." }, { status: 400 });
  }

  // A follow-up like "what about contractors?" carries its subject in the
  // history, so search the rewritten query rather than the raw text.
  const searchQuery =
    body.messages.length > 1
      ? await rewriteQuery(model, body.messages, question)
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

  const chatId = body.chatId ?? null;
  const sources = toCitedSources(hits);

  const stream = createUIMessageStream<OnirixUIMessage>({
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
          onFinish: async ({ text }) => {
            if (!chatId) return;
            try {
              await persistTurn({
                db,
                chatId,
                organizationId: workspace.organizationId,
                userId: session.user.id,
                question,
                answer: text,
                sources,
              });
            } catch (error) {
              // A persistence failure must not break the user's stream; the
              // answer has already been delivered.
              console.error("Failed to persist chat turn", error);
            }
          },
        }).toUIMessageStream<OnirixUIMessage>(),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
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

function extractText(uiMessage: UIMessage | undefined): string {
  if (!uiMessage) return "";
  return uiMessage.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

async function rewriteQuery(
  model: Parameters<typeof generateText>[0]["model"],
  messages: UIMessage[],
  fallback: string,
): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      system: QUERY_REWRITE_PROMPT,
      // Recent turns only; the whole history is unnecessary and costly.
      messages: await convertToModelMessages(messages.slice(-6)),
    });
    return text.trim() || fallback;
  } catch {
    // Rewriting is an optimization. If it fails, search the raw question.
    return fallback;
  }
}

async function persistTurn(args: {
  db: ReturnType<typeof getDb>;
  chatId: string;
  organizationId: string;
  userId: string;
  question: string;
  answer: string;
  sources: CitedSource[];
}) {
  const { db, chatId, answer, sources } = args;

  const owned = await db.query.chat.findFirst({
    where: and(
      eq(chat.id, chatId),
      eq(chat.organizationId, args.organizationId),
      eq(chat.userId, args.userId),
    ),
  });
  if (!owned) return;

  await db.insert(message).values({
    id: randomUUID(),
    chatId,
    role: "user",
    content: args.question,
  });

  const assistantMessageId = randomUUID();
  await db.insert(message).values({
    id: assistantMessageId,
    chatId,
    role: "assistant",
    content: answer,
  });

  // Store only the sources the model actually cited. Retrieval returns more
  // context than gets used, and listing all of it would misstate the basis of
  // the answer.
  const cited = extractCitedIndices(answer);
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

  // First exchange names the conversation.
  if (owned.title === "New conversation") {
    const existing = await db.query.message.findMany({
      where: eq(message.chatId, chatId),
      orderBy: asc(message.createdAt),
      limit: 3,
    });
    if (existing.length <= 2) {
      await db
        .update(chat)
        .set({ title: args.question.slice(0, 80) })
        .where(eq(chat.id, chatId));
    }
  }
}
