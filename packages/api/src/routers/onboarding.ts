/**
 * Onboarding: create an organization and choose the models that power it.
 *
 * PRODUCT.md wants the gap between signing up and useful AI to be small, so
 * setup is a short checklist — name the workspace, connect a provider — that
 * the user works through inside the app rather than behind a wizard.
 *
 * Each step is its own mutation so progress survives a reload, and connecting
 * a provider again later is the same call as connecting it the first time.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { llmConfig, member, organization } from "@onirix/db/schema";
import {
  PROVIDERS,
  type ProviderId,
  findEmbeddingModel,
  providerIdSchema,
  providersWithServerKey,
} from "@onirix/llm";
import { getIndexName } from "@onirix/search";

import { orgProcedure, protectedProcedure, router } from "../index";

const connectInput = z.object({
  provider: providerIdSchema,
  /** Every model the workspace is enabling; the first is the default. */
  models: z.array(z.string().min(1)).min(1),
  apiKey: z.string().nullable(),
  baseUrl: z.string().url().nullable(),
  autoUpdateModels: z.boolean().default(true),
  /**
   * Only supplied when the chat provider serves no embeddings and the
   * deployment holds no key for one that does — the dialog asks then.
   */
  embedding: z
    .object({ provider: providerIdSchema, model: z.string().min(1) })
    .nullable()
    .default(null),
});

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Suffix keeps slugs unique without a retry loop on collision.
  return `${base || "workspace"}-${randomUUID().slice(0, 6)}`;
}

/**
 * Picks the embedding half of the configuration.
 *
 * Indexing needs an embedding model, but the setup dialog is about chat, so
 * this infers one wherever it honestly can: the chat provider's own embedding
 * model first, then any provider the deployment already holds a key for. Only
 * when neither applies does the caller have to choose.
 */
function resolveEmbedding(
  chatProvider: ProviderId,
  explicit: { provider: ProviderId; model: string } | null,
  serverKeys: Set<ProviderId>,
): { provider: ProviderId; model: string } {
  if (explicit) return explicit;

  const own = PROVIDERS[chatProvider].embeddingModels[0];
  if (own) return { provider: chatProvider, model: own.id };

  for (const id of serverKeys) {
    const model = PROVIDERS[id].embeddingModels[0];
    if (model) return { provider: id, model: model.id };
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${PROVIDERS[chatProvider].label} serves no embedding model. Choose one from another provider so Onirix can index your documents.`,
  });
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
      selfHostedLabel: provider.selfHostedLabel ?? null,
      cloud: provider.cloud ?? null,
      chatModels: provider.chatModels,
      embeddingModels: provider.embeddingModels,
      /** True when connecting this provider alone is enough to index. */
      servesEmbeddings: provider.embeddingModels.length > 0,
    }));
  }),

  /** Which setup steps are still outstanding. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const membership = await ctx.db.query.member.findFirst({
      where: eq(member.userId, ctx.session!.user.id),
      with: { organization: { with: { llmConfig: true } } },
    });

    const config = membership?.organization.llmConfig ?? null;

    return {
      hasOrganization: Boolean(membership),
      hasModelConfig: Boolean(config),
      organizationName: membership?.organization.name ?? null,
      connectedProvider: config?.chatProvider ?? null,
      connectedModels: config?.chatModels ?? [],
    };
  }),

  /** Step one: name the workspace. The creator owns it. */
  createWorkspace: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
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

      const organizationId = randomUUID();

      await ctx.db.transaction(async (tx) => {
        await tx.insert(organization).values({
          id: organizationId,
          name: input.name,
          slug: slugify(input.name),
        });

        await tx.insert(member).values({
          id: randomUUID(),
          organizationId,
          userId,
          role: "owner",
        });
      });

      return { organizationId };
    }),

  /**
   * Step two: connect a provider and enable models on it.
   *
   * Replaces whatever was configured before, so reconnecting after a reset —
   * or switching provider outright — is the same call.
   */
  connect: orgProcedure.input(connectInput).mutation(async ({ ctx, input }) => {
    const { organizationId } = ctx;
    const spec = PROVIDERS[input.provider];
    const serverKeys = providersWithServerKey(ctx.env);

    // Every enabled model has to be one we know how to call.
    const known = new Set(spec.chatModels.map((model) => model.id));
    const unknown = input.models.filter((model) => !known.has(model));
    if (unknown.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${spec.label} does not serve ${unknown.join(", ")}.`,
      });
    }

    // Reject a missing credential here rather than letting the first request
    // fail with a confusing error much later. A self-hosted provider needs an
    // endpoint instead; a key stands in for one when it points at the cloud.
    if (spec.selfHosted) {
      if (!input.baseUrl && !input.apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${spec.label} needs either an endpoint to reach or a cloud API key.`,
        });
      }
    } else if (spec.requiresApiKey && !input.apiKey && !serverKeys.has(input.provider)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${spec.label} requires an API key.`,
      });
    }

    const embedding = resolveEmbedding(input.provider, input.embedding, serverKeys);
    const embeddingSpec = findEmbeddingModel(embedding.provider, embedding.model);
    if (!embeddingSpec) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown embedding model "${embedding.model}".`,
      });
    }

    // Embeddings reuse the chat credential only when they run on the same
    // provider; otherwise the deployment's own key is the only one we have.
    const sameProvider = embedding.provider === input.provider;
    const values = {
      organizationId,
      chatProvider: input.provider,
      chatModel: input.models[0]!,
      chatModels: input.models,
      autoUpdateModels: input.autoUpdateModels,
      chatApiKey: input.apiKey,
      chatBaseUrl: input.baseUrl,
      embeddingProvider: embedding.provider,
      embeddingModel: embedding.model,
      embeddingApiKey: sameProvider ? input.apiKey : null,
      embeddingBaseUrl: sameProvider ? input.baseUrl : null,
      embeddingDimension: String(embeddingSpec.dimension),
      indexName: getIndexName(embedding.model),
    };

    await ctx.db
      .insert(llmConfig)
      .values({ id: randomUUID(), ...values })
      .onConflictDoUpdate({ target: llmConfig.organizationId, set: values });

    // Create the index up front so the first upload does not pay for it.
    const index = ctx.getDocumentIndex(embedding.model, embeddingSpec.dimension);
    await index.ensureReady();

    return { organizationId };
  }),

  /**
   * Drops the workspace's model configuration, sending the owner back to the
   * "connect your models" step.
   *
   * Deliberately narrow: chats, documents and the search index survive, so
   * this is a way to change your mind about a provider, not a way to erase the
   * workspace.
   */
  reset: orgProcedure.mutation(async ({ ctx }) => {
    const { organizationId } = ctx;
    await ctx.db.delete(llmConfig).where(eq(llmConfig.organizationId, organizationId));
    return { organizationId };
  }),
});
