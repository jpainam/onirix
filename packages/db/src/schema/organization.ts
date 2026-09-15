/**
 * Organizations, teams, membership, and per-workspace AI configuration.
 *
 * The organization, member, invitation, team and team_member tables are owned by
 * Better Auth's organization plugin — column names and types match the shapes it
 * declares in `better-auth/plugins/organization`, because its Drizzle adapter
 * reads and writes these rows directly. Adding a column is safe; renaming or
 * retyping one it knows about is not.
 *
 * Every other Onirix table hangs off an organization: PRODUCT.md requires
 * customer organizations to stay isolated from one another, so tenancy is a
 * column on the data, not a convention. Teams are the second axis — a department
 * inside one organization, which is what document visibility is granted to.
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
 * enum would reject (`"admin,moderator"`). The union is enforced in TypeScript.
 */
export type MemberRole = "owner" | "admin" | "member";

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
 * A department: Engineering, Sales, HR, Finance, Leadership.
 *
 * PRODUCT.md calls these groups. They are the unit knowledge access is granted
 * to, so that "HR Knowledge" reaches the HR and Executive teams and no further.
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
 * The workspace's chosen models, set during onboarding.
 *
 * `embeddingModel` and `embeddingDimension` determine the OpenSearch index
 * name and mapping. Changing them requires a reindex, so they are recorded
 * alongside the index name actually in use.
 */
export const llmConfig = pgTable(
  "llm_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    chatProvider: text("chat_provider").notNull(),
    /** The model answers are generated with unless the caller picks another. */
    chatModel: text("chat_model").notNull(),
    /**
     * Every model the workspace has enabled for this provider. `chatModel` is
     * the default among them.
     */
    chatModels: jsonb("chat_models").$type<string[]>().notNull().default([]),
    /**
     * Track the built-in catalog: when Onirix ships support for new models
     * from this provider, enable them without the admin revisiting setup.
     */
    autoUpdateModels: boolean("auto_update_models").notNull().default(true),
    // Null for self-hosted providers that need no credential.
    chatApiKey: text("chat_api_key"),
    chatBaseUrl: text("chat_base_url"),

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
  llmConfig: one(llmConfig),
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

export const llmConfigRelations = relations(llmConfig, ({ one }) => ({
  organization: one(organization, {
    fields: [llmConfig.organizationId],
    references: [organization.id],
  }),
}));
