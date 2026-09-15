/**
 * Organizations, membership, and per-workspace AI configuration.
 *
 * Every other Onirix table hangs off an organization: PRODUCT.md requires
 * customer organizations to stay isolated from one another, so tenancy is a
 * column on the data, not a convention.
 */
import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
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
    role: memberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("member_org_user_uidx").on(table.organizationId, table.userId),
    index("member_user_idx").on(table.userId),
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
    chatModel: text("chat_model").notNull(),
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
  llmConfig: one(llmConfig),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const llmConfigRelations = relations(llmConfig, ({ one }) => ({
  organization: one(organization, {
    fields: [llmConfig.organizationId],
    references: [organization.id],
  }),
}));
