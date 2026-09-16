/**
 * Sources, documents, and knowledge collections.
 *
 * Postgres holds document metadata and sync state; the chunk text and vectors
 * live in OpenSearch. The two are linked by `document.id`, which is also the
 * `document_id` written into every chunk.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
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
  /** Amazon S3, or any S3-compatible store such as MinIO or Cloudflare R2. */
  "s3",
  /**
   * A live PostgreSQL database the model may query, rather than a system whose
   * documents are indexed. Its `config` is a `PostgresSourceConfig`, it never
   * produces documents, and `default_visibility` decides who may query it.
   */
  "postgres",
]);

export const syncStatus = pgEnum("sync_status", [
  "not_started",
  /** A sync is on the queue and no worker has picked it up yet. */
  "queued",
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

    /**
     * How often the worker re-reads the source, in minutes. Null means only
     * when an admin asks. Uploads and databases never sync, so they leave it
     * null too.
     */
    syncIntervalMinutes: integer("sync_interval_minutes"),

    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
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

    /**
     * The document's identity inside its source: a page URL, a Drive file id,
     * an object key. What a re-sync matches on to tell "changed" from "new",
     * and what pruning uses to tell "gone". Null for uploads, which have no
     * source to be re-read from.
     */
    externalId: text("external_id"),
    /**
     * SHA-256 of the stored bytes. A sync that fetches identical bytes skips
     * the extract-and-embed step, which is what makes a nightly re-read of a
     * large site affordable.
     */
    contentHash: text("content_hash"),
    /**
     * The sync run that last saw this document. After a run finishes, any
     * document of the source it did not stamp was not found at the source any
     * more, and is removed.
     */
    lastSyncRunId: text("last_sync_run_id"),

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
    // A sync matches what it fetched against what it stored by this pair.
    uniqueIndex("document_source_external_uidx").on(table.sourceId, table.externalId),
  ],
);

/**
 * One pass of a connector over its source.
 *
 * The Sources page reads the latest of these to say what a connector is doing
 * and what it last did; the history is what turns "failed" into "failed at
 * 03:12 with this error, after succeeding the six nights before".
 */
export const sourceSyncRun = pgTable(
  "source_sync_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    // No column default on purpose: `queued` is a value added to the enum by
    // the same migration that creates this table, and Postgres refuses to use
    // an enum value in the transaction that added it. Writers set it.
    status: syncStatus("status").notNull(),
    /** Who asked for it, when a person did. Null for a scheduled run. */
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    error: text("error"),
    /**
     * What the connector reported along the way: pages it skipped, a limit it
     * hit. Not an error, but the difference between "success" and "success,
     * and it stopped at 500 pages".
     */
    notes: text("notes"),
    /** Documents the connector produced, whether or not anything changed. */
    documentsSeen: integer("documents_seen").notNull().default(0),
    documentsAdded: integer("documents_added").notNull().default(0),
    documentsUpdated: integer("documents_updated").notNull().default(0),
    documentsRemoved: integer("documents_removed").notNull().default(0),
    /** Seen, unchanged, and therefore not re-indexed. */
    documentsUnchanged: integer("documents_unchanged").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("source_sync_run_source_idx").on(table.sourceId, table.createdAt)],
);

export const sourceSyncRunRelations = relations(sourceSyncRun, ({ one }) => ({
  source: one(source, { fields: [sourceSyncRun.sourceId], references: [source.id] }),
  requester: one(user, { fields: [sourceSyncRun.requestedBy], references: [user.id] }),
}));

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

/**
 * When a skill's instructions reach the model.
 *
 * `on_demand` is the point of the feature: the model sees only the name and
 * description, and pulls the body with `load_skill` if it judges the skill
 * relevant. That keeps the prompt flat as skills accumulate.
 *
 * `always` inlines the body into every system prompt. It exists because
 * progressive disclosure is not free — loading a skill costs a whole extra
 * model round trip, which re-sends the system prompt and the retrieved context
 * before a word of the answer appears. For a short body that applies to nearly
 * every question, that trade is a loss: a few hundred tokens inlined beat a few
 * thousand plus a second wait. It is also the only way to *guarantee* the model
 * has read something, since a model is free to not call a tool.
 */
export const skillLoading = pgEnum("skill_loading", ["always", "on_demand"]);

/**
 * A named capability the answering model can reach for.
 *
 * Skills are how instructions stop being code. Grounding, citations, response
 * style and chart guidance were all string constants in `@onirix/llm`, which
 * meant a deploy to change how the product answers and a system prompt that grew
 * for every capability whether or not the question needed it.
 *
 * Every skill is a row here, including the ones that ship with the product —
 * nothing about how an answer is written is read from code at answer time. The
 * built-ins are *seeded* from definitions in `@onirix/db/skills`, and a seeded
 * row is an ordinary row from that moment on: editable, disablable, and marked
 * by `builtInId` only so it can be put back the way it came.
 */
export const skill = pgTable(
  "skill",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    /**
     * The identifier the model passes to `load_skill`, and the one the
     * description is listed under. A slug, because it is written by a model
     * into a tool argument rather than read by a person.
     */
    name: text("name").notNull(),
    /**
     * One line, and the single most important field here.
     *
     * For an `on_demand` skill this is *all* the model ever sees unprompted, so
     * it carries the entire decision of whether to load the body. A description
     * that does not say when the skill applies is a skill that never fires.
     */
    description: text("description").notNull(),
    /** The body, in Markdown. What the model is given once the skill applies. */
    instructions: text("instructions").notNull(),

    loading: skillLoading("loading").notNull().default("on_demand"),
    /** Off keeps a skill out of the prompt without losing the text. */
    enabled: boolean("enabled").notNull().default(true),

    /**
     * Set on a row seeded from the product's own defaults, to the id of the
     * definition it came from. Null on a skill someone wrote here.
     *
     * The row is the skill — nothing reads the seed text at answer time. This
     * only records where the row started, which is what lets the Skills page
     * offer "reset to default" and what stops a built-in from being deleted
     * outright.
     */
    builtInId: text("built_in_id"),
    /**
     * Only send this skill when documents were actually retrieved.
     *
     * A column rather than something derived from `builtInId`, so a row
     * describes its own behaviour completely and the answering path never has
     * to look anything up in code.
     */
    requiresContext: boolean("requires_context").notNull().default(false),

    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Names are the namespace `load_skill` resolves in, so two skills in one
    // workspace cannot share one. Collisions with built-in names are rejected
    // in the router, since those live in code and Postgres cannot see them.
    uniqueIndex("skill_org_name_uidx").on(table.organizationId, table.name),
    // Seeding is an upsert on this: one row per built-in per workspace, so
    // re-running the seed never duplicates and a workspace that predates a
    // newly shipped built-in picks it up on the next read.
    uniqueIndex("skill_org_built_in_uidx").on(table.organizationId, table.builtInId),
  ],
);

export const skillRelations = relations(skill, ({ one }) => ({
  organization: one(organization, {
    fields: [skill.organizationId],
    references: [organization.id],
  }),
  author: one(user, { fields: [skill.createdBy], references: [user.id] }),
}));

/**
 * A query an admin wrote for the model to run by name against a `postgres`
 * source in `saved` mode.
 *
 * The strict way to open a database to the assistant. The model chooses a
 * query and supplies parameter values; the SQL that runs is the text stored
 * here, with `$1..$n` bound server-side in the order of `parameters`. Nothing
 * the model writes is ever executed, which is the property a system of record
 * needs and a read-only transaction alone cannot promise.
 */
export const savedQuery = pgTable(
  "saved_query",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    /** What the model writes into `run_saved_query`. A slug, like a skill's name. */
    name: text("name").notNull(),
    /** When to use it, for the model; the one line it decides from. */
    description: text("description").notNull(),
    /** A single SELECT using `$1..$n` for its parameters. */
    sql: text("sql").notNull(),
    /**
     * Ordered declarations of `$1..$n`: name, type and a description. A
     * `SavedQueryParameter[]` from `@onirix/llm/database`.
     */
    parameters: jsonb("parameters")
      .$type<{ name: string; type: string; description: string | null }[]>()
      .default([])
      .notNull(),

    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The model resolves a name within one database, so two queries on the
    // same source cannot share one.
    uniqueIndex("saved_query_source_name_uidx").on(table.sourceId, table.name),
  ],
);

export const savedQueryRelations = relations(savedQuery, ({ one }) => ({
  source: one(source, { fields: [savedQuery.sourceId], references: [source.id] }),
  author: one(user, { fields: [savedQuery.createdBy], references: [user.id] }),
}));

export const sourceRelations = relations(source, ({ one, many }) => ({
  organization: one(organization, {
    fields: [source.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
  defaultTeams: many(sourceDefaultTeam),
  savedQueries: many(savedQuery),
  syncRuns: many(sourceSyncRun),
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
