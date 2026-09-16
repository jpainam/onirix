/**
 * Reopening a stored conversation.
 *
 * A reopened conversation has to read exactly like a live one — same inline
 * markers, same inspectable passage behind every `[1]` — so history is mapped
 * back into `OnirixUIMessage` rather than into a separate read-only shape.
 * That way the chat panel renders both through one path.
 */
import { and, asc, eq } from "drizzle-orm";

import { chat, citation, message } from "@onirix/db/schema";
import { chartSpecSchema } from "@onirix/llm/chart";

import { isChartPart, type ChartPart } from "@/lib/chat-message";
import type { CitedSource, OnirixUIMessage } from "@/lib/chat-message";
import { getDb } from "@/services";

export type StoredConversation = {
  id: string;
  /** Null while the conversation is still unnamed. */
  title: string | null;
  messages: OnirixUIMessage[];
};

/**
 * Null rather than a thrown error when the conversation is not the caller's:
 * ownership is part of the lookup, so someone else's conversation is simply
 * not found — the caller cannot tell it apart from one that never existed.
 */
export async function loadConversation(args: {
  chatId: string;
  organizationId: string;
  userId: string;
}): Promise<StoredConversation | null> {
  const db = getDb();

  const found = await db.query.chat.findFirst({
    where: and(
      eq(chat.id, args.chatId),
      eq(chat.organizationId, args.organizationId),
      // Conversations are private to their author until shared.
      eq(chat.userId, args.userId),
    ),
  });
  if (!found) return null;

  const rows = await db.query.message.findMany({
    where: eq(message.chatId, args.chatId),
    orderBy: asc(message.createdAt),
    with: {
      citations: {
        orderBy: asc(citation.index),
        // A citation row snapshots the passage but not where it came from, so
        // the provenance line is recovered through the document it points at.
        // Columns are listed explicitly rather than pulled wholesale:
        // `source.config` holds connector credentials.
        with: {
          document: {
            columns: { sourceUpdatedAt: true },
            with: { source: { columns: { type: true } } },
          },
        },
      },
    },
  });

  return {
    id: found.id,
    title: found.title,
    // A message that restores to nothing is dropped rather than shown empty.
    // `persistTurn` refuses to write one, so this only catches rows from before
    // that guard existed — but the cost of letting one through is high: an empty
    // assistant turn is sent to the provider verbatim on the next question, and
    // a provider asked to continue from empty assistant content rejects the
    // request, which would make the conversation permanently unusable.
    messages: rows.map(toUIMessage).filter(hasContent),
  };
}

/** Whether a restored message has anything in it beyond its citation list. */
function hasContent(message: OnirixUIMessage): boolean {
  return message.parts.some((part) =>
    part.type === "text" ? part.text.trim().length > 0 : part.type !== "data-sources",
  );
}

/**
 * Validates the stored part list before it is handed to the renderer.
 *
 * The column is `jsonb`, so nothing about its contents is guaranteed by the
 * database: a row written by an older build, or by a schema since changed, must
 * degrade to the plain text rather than crash the conversation. A chart whose
 * spec no longer parses is dropped; the prose around it still reads.
 */
function restoreParts(raw: unknown[] | null): OnirixUIMessage["parts"] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap<OnirixUIMessage["parts"][number]>((candidate) => {
    const part = candidate as OnirixUIMessage["parts"][number];
    if (part?.type === "text" && typeof part.text === "string") return [part];
    if (!isChartPart(part)) return [];

    const spec = chartSpecSchema.safeParse(part.input);
    if (!spec.success) return [];

    // Rebuilt as a completed call whatever state it was stored in. The next
    // turn converts this history back into model messages, and a tool call
    // without a matching result is rejected there.
    const restored: ChartPart = {
      type: "tool-render_chart",
      toolCallId: part.toolCallId,
      state: "output-available",
      input: spec.data,
      output: { rendered: true },
    };
    return [restored];
  });
}

function toUIMessage(row: {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: unknown[] | null;
  citations: StoredCitation[];
}): OnirixUIMessage {
  // Stored parts keep the original interleaving of prose and charts. Falling
  // back to the flat text matters for turns written before charts existed, and
  // for any turn whose parts failed to store.
  const stored = restoreParts(row.parts);
  const parts: OnirixUIMessage["parts"] =
    stored.length > 0 ? stored : [{ type: "text", text: row.content }];

  // A live turn ships every retrieved chunk and lets the renderer narrow to the
  // cited ones; only the cited ones were ever stored, so the restored list is
  // already narrowed. The part is still named `sources` and placed ahead of the
  // text so a restored message is indistinguishable from a streamed one.
  if (row.citations.length > 0) {
    parts.unshift({
      type: "data-sources",
      id: "sources",
      data: row.citations.map(toCitedSource),
    });
  }

  return { id: row.id, role: row.role, parts };
}

type StoredCitation = {
  index: number;
  documentId: string | null;
  passage: string;
  documentTitle: string;
  sourceUrl: string | null;
  document: {
    sourceUpdatedAt: Date | null;
    source: { type: string };
  } | null;
};

function toCitedSource(row: StoredCitation): CitedSource {
  return {
    index: row.index,
    // Deleting a document nulls the reference but leaves the citation, so an
    // answer never loses the passage it was grounded in.
    documentId: row.documentId ?? "",
    title: row.documentTitle,
    sourceType: row.document?.source.type ?? "unknown",
    updatedAt: row.document?.sourceUpdatedAt
      ? row.document.sourceUpdatedAt.toISOString().slice(0, 10)
      : null,
    passage: row.passage,
    url: row.sourceUrl,
  };
}
