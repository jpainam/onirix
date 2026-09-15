/**
 * Onboarding: create an organization and choose the models that power it.
 *
 * PRODUCT.md wants the gap between signing up and useful AI to be small, so
 * this is deliberately two steps — name the company, pick a model — and then
 * straight into Chat.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { llmConfig, member, organization } from "@onirix/db/schema";
import {
  PROVIDERS,
  findEmbeddingModel,
  providerIdSchema,
  providersWithServerKey,
} from "@onirix/llm";
import { getIndexName } from "@onirix/search";

import { protectedProcedure, router } from "../index";

const setupInput = z.object({
  organizationName: z.string().min(1).max(120),
  chat: z.object({
    provider: providerIdSchema,
    model: z.string().min(1),
    apiKey: z.string().nullable(),
    baseUrl: z.string().url().nullable(),
  }),
  embedding: z.object({
    provider: providerIdSchema,
    model: z.string().min(1),
    apiKey: z.string().nullable(),
    baseUrl: z.string().url().nullable(),
  }),
});

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Suffix keeps slugs unique without a retry loop on collision.
  return `${base || "workspace"}-${randomUUID().slice(0, 6)}`;
}

export const onboardingRouter = router({
  /**
   * Model catalog for the picker.
   *
   * Reports whether the deployment already holds a key for each provider, so
   * the UI can skip the credential field. Never returns a key itself.
   */
  providers: protectedProcedure.query(({ ctx }) => {
    const serverKeys = providersWithServerKey(ctx.env);

    return Object.values(PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
      requiresApiKey: provider.requiresApiKey,
      hasServerKey: serverKeys.has(provider.id),
      selfHosted: provider.selfHosted,
      defaultBaseUrl: provider.defaultBaseUrl ?? null,
      chatModels: provider.chatModels,
      embeddingModels: provider.embeddingModels,
    }));
  }),

  /** Whether the caller still needs to go through setup. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const membership = await ctx.db.query.member.findFirst({
      where: eq(member.userId, ctx.session!.user.id),
      with: { organization: { with: { llmConfig: true } } },
    });

    return {
      hasOrganization: Boolean(membership),
      hasModelConfig: Boolean(membership?.organization.llmConfig),
      organizationName: membership?.organization.name ?? null,
    };
  }),

  setup: protectedProcedure.input(setupInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session!.user.id;

    const existing = await ctx.db.query.member.findFirst({
      where: eq(member.userId, userId),
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "You already belong to an organization.",
      });
    }

    const embeddingSpec = findEmbeddingModel(input.embedding.provider, input.embedding.model);
    if (!embeddingSpec) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown embedding model "${input.embedding.model}".`,
      });
    }

    // Reject a missing credential here rather than letting the first indexing
    // job fail with a confusing error much later. A provider the deployment
    // already has a key for needs nothing from the user.
    const serverKeys = providersWithServerKey(ctx.env);
    for (const [label, choice] of [
      ["chat", input.chat],
      ["embedding", input.embedding],
    ] as const) {
      const needsKey =
        PROVIDERS[choice.provider].requiresApiKey &&
        !choice.apiKey &&
        !serverKeys.has(choice.provider);

      if (needsKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${PROVIDERS[choice.provider].label} requires an API key for ${label}.`,
        });
      }
    }

    const organizationId = randomUUID();

    await ctx.db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: organizationId,
        name: input.organizationName,
        slug: slugify(input.organizationName),
      });

      // The creator owns the workspace.
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId,
        userId,
        role: "owner",
      });

      await tx.insert(llmConfig).values({
        id: randomUUID(),
        organizationId,
        chatProvider: input.chat.provider,
        chatModel: input.chat.model,
        chatApiKey: input.chat.apiKey,
        chatBaseUrl: input.chat.baseUrl,
        embeddingProvider: input.embedding.provider,
        embeddingModel: input.embedding.model,
        embeddingApiKey: input.embedding.apiKey,
        embeddingBaseUrl: input.embedding.baseUrl,
        embeddingDimension: String(embeddingSpec.dimension),
        indexName: getIndexName(input.embedding.model),
      });
    });

    // Create the index up front so the first upload does not pay for it.
    const index = ctx.getDocumentIndex(input.embedding.model, embeddingSpec.dimension);
    await index.ensureReady();

    return { organizationId };
  }),
});
