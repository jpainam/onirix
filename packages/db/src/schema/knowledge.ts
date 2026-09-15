/**
 * Sources, documents, and knowledge collections.
 *
 * Postgres holds document metadata and sync state; the chunk text and vectors
 * live in OpenSearch. The two are linked by `document.id`, which is also the
 * `document_id` written into every chunk.
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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organization } from "./organization";

export const sourceType = pgEnum("source_type", [
  "file_upload",
  "google_drive",
  "sharepoint",
  "onedrive",
  "notion",
  "slack",
  "confluence",
  "github",
  "website",
]);

export const syncStatus = pgEnum("sync_status", [
  "not_started",
  "in_progress",
  "success",
  "failed",
]);

/** A connected system Onirix indexes from. */
export const source = pgTable(
  "source",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: sourceType("type").notNull(),
    name: text("name").notNull(),
    /** Connector-specific settings and credentials. */
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),

    status: syncStatus("status").notNull().default("not_started"),
    lastSyncedAt: timestamp("last_synced_at"),
    /** Surfaced in the Sources list when a connection needs attention. */
    lastError: text("last_error"),
    documentCount: integer("document_count").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("source_org_idx").on(table.organizationId)],
);

/** A logical grouping of knowledge, e.g. "Engineering", spanning several sources. */
export const collection = pgTable(
  "collection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("collection_org_name_uidx").on(table.organizationId, table.name)],
);

export const documentIndexStatus = pgEnum("document_index_status", [
  "pending",
  "processing",
  "indexed",
  "failed",
]);

export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").references(() => collection.id, {
      onDelete: "set null",
    }),

    /** Human-readable name shown in results and citations. */
    title: text("title").notNull(),
    /** Link back to the document in its originating system, when one exists. */
    sourceUrl: text("source_url"),
    /** Key in the S3/MinIO file store for uploaded originals. */
    fileKey: text("file_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    status: documentIndexStatus("status").notNull().default("pending"),
    chunkCount: integer("chunk_count").notNull().default(0),
    indexError: text("index_error"),

    /**
     * Whether everyone in the organization may see this document. When false,
     * visibility is decided by `accessControlList`. Mirrored into OpenSearch
     * so retrieval can filter without a second round trip.
     */
    isPublic: text("is_public").notNull().default("true"),
    accessControlList: jsonb("access_control_list").$type<string[]>().default([]).notNull(),

    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    /** Last modified at the source, not in Onirix. Drives recency scoring. */
    sourceUpdatedAt: timestamp("source_updated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("document_org_idx").on(table.organizationId),
    index("document_source_idx").on(table.sourceId),
    index("document_status_idx").on(table.status),
  ],
);

export const sourceRelations = relations(source, ({ one, many }) => ({
  organization: one(organization, {
    fields: [source.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
}));

export const collectionRelations = relations(collection, ({ one, many }) => ({
  organization: one(organization, {
    fields: [collection.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
}));

export const documentRelations = relations(document, ({ one }) => ({
  organization: one(organization, {
    fields: [document.organizationId],
    references: [organization.id],
  }),
  source: one(source, { fields: [document.sourceId], references: [source.id] }),
  collection: one(collection, {
    fields: [document.collectionId],
    references: [collection.id],
  }),
}));
