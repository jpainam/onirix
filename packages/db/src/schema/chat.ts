/**
 * Conversations, messages, and the citations backing each answer.
 *
 * Citations are stored as rows rather than parsed out of the message text, so
 * the UI can resolve `[1]` to a document and passage without re-running
 * retrieval, and so an answer stays auditable after its sources change.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { document } from "./knowledge";
import { organization } from "./organization";

export const messageRole = pgEnum("message_role", ["user", "assistant", "system"]);

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Null until the opening exchange names the conversation. Nullable rather
     * than a placeholder string so nothing has to compare against a magic
     * title — a user who renames a chat "New conversation" keeps that name.
     */
    title: text("title"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("chat_org_user_idx").on(table.organizationId, table.userId),
    index("chat_updated_idx").on(table.updatedAt),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    /** AI SDK message parts, retained so tool calls survive a reload. */
    parts: jsonb("parts").$type<unknown[]>(),
    /**
     * What the turn cost, as the provider reported it. Assistant rows only, and
     * null on every row written before this was recorded: the Usage page counts
     * a null as nothing spent rather than backfilling a guess, so an old
     * workspace shows a token history that starts when the meter did.
     *
     * Stored per message rather than summed into a counter because the question
     * "which model spent this" is only answerable at the row that spent it.
     */
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("message_chat_idx").on(table.chatId, table.createdAt),
    // Usage buckets every message by day across a whole workspace, which is the
    // one read that does not start from a conversation.
    index("message_created_idx").on(table.createdAt),
  ],
);

export const citation = pgTable(
  "citation",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    /** The number the model wrote inline, e.g. 1 for `[1]`. */
    index: integer("index").notNull(),
    documentId: text("document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    /** Snapshot of the cited passage, so the citation survives reindexing. */
    passage: text("passage").notNull(),
    documentTitle: text("document_title").notNull(),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("citation_message_idx").on(table.messageId)],
);

/**
 * The documents a conversation has been pointed at.
 *
 * Attaching grants nothing. A document already belongs to the workspace and
 * is already searched by every conversation that is allowed to see it; this
 * row only says "read these first" for one conversation. Visibility is checked
 * when the row is written and again on every read and every retrieval, so a
 * document whose audience narrows afterwards simply stops answering here.
 *
 * The same document may be attached to any number of conversations, which is
 * what lets a file uploaded once be reused rather than uploaded again.
 */
export const chatDocument = pgTable(
  "chat_document",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.documentId] }),
    // "Which conversations use this document" starts from the document.
    index("chat_document_document_idx").on(table.documentId),
  ],
);

export const chatRelations = relations(chat, ({ one, many }) => ({
  organization: one(organization, {
    fields: [chat.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [chat.userId], references: [user.id] }),
  messages: many(message),
  documents: many(chatDocument),
}));

export const chatDocumentRelations = relations(chatDocument, ({ one }) => ({
  chat: one(chat, { fields: [chatDocument.chatId], references: [chat.id] }),
  document: one(document, {
    fields: [chatDocument.documentId],
    references: [document.id],
  }),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
  citations: many(citation),
}));

export const citationRelations = relations(citation, ({ one }) => ({
  message: one(message, { fields: [citation.messageId], references: [message.id] }),
  document: one(document, { fields: [citation.documentId], references: [document.id] }),
}));
