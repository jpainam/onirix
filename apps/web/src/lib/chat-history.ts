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

  return { id: found.id, title: found.title, messages: rows.map(toUIMessage) };
}

function toUIMessage(row: {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: StoredCitation[];
}): OnirixUIMessage {
  const parts: OnirixUIMessage["parts"] = [{ type: "text", text: row.content }];

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
