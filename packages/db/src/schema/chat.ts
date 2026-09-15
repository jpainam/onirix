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
    /** Generated from the first exchange; editable by the user. */
    title: text("title").notNull().default("New conversation"),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("message_chat_idx").on(table.chatId, table.createdAt)],
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

export const chatRelations = relations(chat, ({ one, many }) => ({
  organization: one(organization, {
    fields: [chat.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [chat.userId], references: [user.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
  citations: many(citation),
}));

export const citationRelations = relations(citation, ({ one }) => ({
  message: one(message, { fields: [citation.messageId], references: [message.id] }),
  document: one(document, { fields: [citation.documentId], references: [document.id] }),
}));
