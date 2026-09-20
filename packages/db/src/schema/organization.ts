/**
 * Organizations, teams, membership, and per-workspace AI configuration.
 *
 * The organization, member, invitation, team, team_member and organization_role
 * tables are owned by Better Auth's organization plugin: column names and types match the shapes it
 * declares in `better-auth/plugins/organization`, because its Drizzle adapter
 * reads and writes these rows directly. Adding a column is safe; renaming or
 * retyping one it knows about is not.
 *
 * Every other Onirix table hangs off an organization: PRODUCT.md requires
 * customer organizations to stay isolated from one another, so tenancy is a
 * column on the data, not a convention. Teams are the second axis: a group
 * inside one organization, usually a department, and what document visibility
 * is granted to.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Roles are plain text rather than an enum: Better Auth writes this column, and
 * both its dynamic access control add-on and multi-role members store values an
 * enum would reject (`"admin,moderator"`).
 *
 * Custom roles created from the Roles page are stored in `organization_role` and
 * land in this column by name, so the built-in three are a hint for editors
 * rather than a closed set. `permissionsForRole` in `src/permissions.ts` is what
 * turns whatever is here into grants.
 */
export type BuiltInMemberRole = "owner" | "admin" | "member";
export type MemberRole = BuiltInMemberRole | (string & {});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  /** Free-form JSON string. Better Auth serializes it; we do not read it. */
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("member_org_user_uidx").on(table.organizationId, table.userId),
    index("member_user_idx").on(table.userId),
  ],
);

/**
 * A pending invitation to join an organization, optionally onto a team.
 *
 * Rows are created and consumed entirely by Better Auth; Onirix only reads them
 * to render the pending list on the Team page.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<MemberRole>(),
    /** Team the invitee joins on acceptance, when the inviter picked one. */
    teamId: text("team_id"),
    /** "pending" | "accepted" | "rejected" | "canceled", per Better Auth. */
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invitation_org_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

/**
 * A team: Engineering, Sales, HR, Finance, Leadership.
 *
 * PRODUCT.md calls these groups, the UI calls them teams. They are the unit
 * knowledge access is granted to, so that "HR Knowledge" reaches the HR and
 * Executive teams and no further.
 */
export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Maintained by Better Auth as members are added and removed. */
    memberCount: integer("member_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("team_org_name_uidx").on(table.organizationId, table.name),
    index("team_org_idx").on(table.organizationId),
  ],
);

export const teamMember = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Better Auth's own uniqueness guard on (team, user). It populates and
     * enforces this; the unique index below backs it at the database level.
     */
    membershipKey: text("membership_key").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("team_member_team_user_uidx").on(table.teamId, table.userId),
    index("team_member_user_idx").on(table.userId),
  ],
);

/**
 * A custom role, created by an admin on the Roles page.
 *
 * Owned by Better Auth's dynamic access control: it writes `permission` as a
 * JSON string of resource to actions, validated against the statement map the
 * plugin was built with. Onirix reads the same rows in `permissionsForRole` to
 * gate tRPC procedures and to decide which controls a page renders, so a role
 * means the same thing on both sides of a request.
 *
 * A row whose `role` matches a built-in name widens that role rather than
 * replacing it, which is the plugin's merge behaviour and not something to
 * "fix" here.
 */
export const organizationRole = pgTable(
  "organization_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Lower cased by Better Auth before it is stored. */
    role: text("role").notNull(),
    /** JSON: `{"source":["create","update"],"team":["create"]}`. */
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_role_org_role_uidx").on(table.organizationId, table.role),
    index("organization_role_org_idx").on(table.organizationId),
  ],
);

/**
 * A provider the workspace has connected, with the models enabled on it.
 *
 * A workspace holds as many of these as it likes — Onyx-style, the admin adds
 * OpenAI and Anthropic side by side and picks a default across them — which is
 * why credentials live here rather than on the single `llm_config` row: a key
 * belongs to the provider it opens, not to the workspace's current default.
 */
export const llmProvider = pgTable(
  "llm_provider",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    /** A `ProviderId` from the `@onirix/llm` catalog. */
    provider: text("provider").notNull(),
    /** Null when the deployment's own environment key covers this provider. */
    apiKey: text("api_key"),
    /** Set for self-hosted endpoints and cloud proxies. */
    baseUrl: text("base_url"),

    /** Chat models the workspace has enabled on this provider. */
    chatModels: jsonb("chat_models").$type<string[]>().notNull().default([]),
    /**
     * Track the built-in catalog: when Onirix ships support for new models
     * from this provider, enable them without the admin revisiting setup.
     */
    autoUpdateModels: boolean("auto_update_models").notNull().default(true),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("llm_provider_org_provider_uidx").on(table.organizationId, table.provider),
    index("llm_provider_org_idx").on(table.organizationId),
  ],
);

/**
 * The workspace's default chat model and its one embedding model.
 *
 * `chatProvider` and `chatModel` point at a model enabled on one of the
 * connected `llm_provider` rows; the credentials to reach it come from that
 * row. Embeddings are the exception that stays here: `embeddingModel` and
 * `embeddingDimension` determine the OpenSearch index name and mapping, so
 * changing them requires a reindex rather than a hot swap, and they are
 * recorded alongside the index name actually in use.
 */
export const llmConfig = pgTable(
  "llm_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    /** Provider of the default chat model; a connected `llm_provider`. */
    chatProvider: text("chat_provider").notNull(),
    /** The model answers are generated with unless the caller picks another. */
    chatModel: text("chat_model").notNull(),
    /** An `AnswerEffort` from the `@onirix/llm` catalog. */
    answerEffort: text("answer_effort").notNull().default("low"),

    embeddingProvider: text("embedding_provider").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingApiKey: text("embedding_api_key"),
    embeddingBaseUrl: text("embedding_base_url"),
    embeddingDimension: text("embedding_dimension").notNull(),

    /** Index this configuration writes to; changes only on reindex. */
    indexName: text("index_name").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("llm_config_org_uidx").on(table.organizationId)],
);

export const organizationRelations = relations(organization, ({ many, one }) => ({
  members: many(member),
  invitations: many(invitation),
  teams: many(team),
  roles: many(organizationRole),
  llmConfig: one(llmConfig),
  llmProviders: many(llmProvider),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
  team: one(team, { fields: [invitation.teamId], references: [team.id] }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  members: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  user: one(user, { fields: [teamMember.userId], references: [user.id] }),
}));

export const organizationRoleRelations = relations(organizationRole, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationRole.organizationId],
    references: [organization.id],
  }),
}));

export const llmConfigRelations = relations(llmConfig, ({ one }) => ({
  organization: one(organization, {
    fields: [llmConfig.organizationId],
    references: [organization.id],
  }),
}));

export const llmProviderRelations = relations(llmProvider, ({ one }) => ({
  organization: one(organization, {
    fields: [llmProvider.organizationId],
    references: [organization.id],
  }),
}));
