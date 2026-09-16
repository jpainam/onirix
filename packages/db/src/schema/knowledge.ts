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
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organization, team } from "./organization";

/**
 * Who inside an organization may read a document.
 *
 * `organization` is workspace-wide. `teams` restricts to the teams listed
 * in `document_team` — this is what keeps HR's files out of Sales' answers.
 * `private` restricts to the uploader alone.
 *
 * Nothing here can widen access across organizations: every query is scoped by
 * `organization_id` first, and visibility only ever narrows from there.
 */
export const documentVisibility = pgEnum("document_visibility", [
  "organization",
  "teams",
  "private",
]);

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

    /**
     * Visibility stamped onto documents this source produces.
     *
     * Pointing a connector at a department's drive is the practical way to keep
     * that team's knowledge contained, since tagging each synced file by hand
     * does not scale, and a connector that syncs nightly would need re-tagging
     * forever. Documents take a copy at ingest time, so changing this affects
     * new documents only; existing ones are retargeted explicitly.
     */
    defaultVisibility: documentVisibility("default_visibility")
      .notNull()
      .default("organization"),

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
     * Who may read this document. The authoritative answer, together with the
     * `document_team` rows it points at.
     */
    visibility: documentVisibility("visibility").notNull().default("organization"),
    /**
     * The tokens a reader must hold to see this document, derived from
     * `visibility` and `document_team` by `resolveDocumentAcl`. Empty when
     * visibility is `organization`, which grants access on its own.
     *
     * Materialized rather than joined at query time because the same list has
     * to be mirrored into every OpenSearch chunk, where no join exists. Treat
     * it as a cache with exactly one writer: never set it by hand.
     */
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
    // Listing a workspace's documents always filters on visibility first.
    index("document_org_visibility_idx").on(table.organizationId, table.visibility),
  ],
);

/**
 * Teams a source grants its documents to, applied when `defaultVisibility` is
 * `teams`.
 */
export const sourceDefaultTeam = pgTable(
  "source_default_team",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.teamId] }),
    index("source_default_team_team_idx").on(table.teamId),
  ],
);

/**
 * Teams a document is shared with, consulted when `visibility` is `teams`.
 *
 * Deleting a team removes its grants, which narrows access rather than widening
 * it — the safe direction to fail in. A document left with no teams becomes
 * readable by its uploader alone.
 */
export const documentTeam = pgTable(
  "document_team",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.teamId] }),
    index("document_team_team_idx").on(table.teamId),
  ],
);

export const sourceRelations = relations(source, ({ one, many }) => ({
  organization: one(organization, {
    fields: [source.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
  defaultTeams: many(sourceDefaultTeam),
}));

export const sourceDefaultTeamRelations = relations(sourceDefaultTeam, ({ one }) => ({
  source: one(source, { fields: [sourceDefaultTeam.sourceId], references: [source.id] }),
  team: one(team, { fields: [sourceDefaultTeam.teamId], references: [team.id] }),
}));

export const collectionRelations = relations(collection, ({ one, many }) => ({
  organization: one(organization, {
    fields: [collection.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
}));

export const documentRelations = relations(document, ({ one, many }) => ({
  organization: one(organization, {
    fields: [document.organizationId],
    references: [organization.id],
  }),
  source: one(source, { fields: [document.sourceId], references: [source.id] }),
  collection: one(collection, {
    fields: [document.collectionId],
    references: [collection.id],
  }),
  teams: many(documentTeam),
}));

export const documentTeamRelations = relations(documentTeam, ({ one }) => ({
  document: one(document, {
    fields: [documentTeam.documentId],
    references: [document.id],
  }),
  team: one(team, { fields: [documentTeam.teamId], references: [team.id] }),
}));
