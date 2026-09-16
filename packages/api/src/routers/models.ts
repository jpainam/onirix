/**
 * The workspace's connected providers and the models enabled on them.
 *
 * A workspace is not married to the provider it picked during setup: an admin
 * adds OpenAI and Anthropic side by side, edits either one's key and models,
 * and chooses a default across all of them. Connecting is therefore additive —
 * a new `llm_provider` row — while `llm_config` keeps only the pointer to the
 * default chat model and the embedding half, which is pinned to the index.
 *
 * `connectProvider` is shared with the onboarding router: the first provider a
 * workspace connects and the fifth go through exactly the same code, the only
 * difference being that the first also settles the embedding model.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { llmConfig, llmProvider } from "@onirix/db/schema";
import {
  PROVIDERS,
  type ProviderId,
  findEmbeddingModel,
  providerIdSchema,
} from "@onirix/llm";
import { getIndexName } from "@onirix/search";

import { adminProcedure, orgProcedure, router } from "../index";
import type { Context } from "../context";

export const connectInput = z.object({
  provider: providerIdSchema,
  /** Every model the workspace is enabling on this provider. */
  models: z.array(z.string().min(1)).min(1),
  /** Null keeps whatever key is already stored for this provider. */
  apiKey: z.string().nullable(),
  baseUrl: z.string().url().nullable(),
  autoUpdateModels: z.boolean().default(true),
  /**
   * Only supplied when the first provider connected serves no embeddings, so
   * the dialog has to ask which one indexes the workspace's documents — and
   * for its key, since Onirix holds none of its own.
   */
  embedding: z
    .object({
      provider: providerIdSchema,
      model: z.string().min(1),
      apiKey: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
});

export type ConnectInput = z.infer<typeof connectInput>;

/**
 * Picks the embedding half of the configuration, and the key to reach it.
 *
 * Indexing needs an embedding model, but the setup dialog is about chat, so
 * this infers one when the chat provider serves embeddings itself, reusing the
 * key just pasted for it. Otherwise the dialog has asked for both, because
 * there is no deployment-wide credential to fall back on.
 */
function resolveEmbedding(
  chat: { provider: ProviderId; apiKey: string | null; baseUrl: string | null },
  explicit: { provider: ProviderId; model: string; apiKey: string | null } | null,
): { provider: ProviderId; model: string; apiKey: string | null; baseUrl: string | null } {
  if (!explicit) {
    const own = PROVIDERS[chat.provider].embeddingModels[0];
    if (!own) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${PROVIDERS[chat.provider].label} serves no embedding model. Choose one from another provider so Onirix can index your documents.`,
      });
    }
    return { provider: chat.provider, model: own.id, apiKey: chat.apiKey, baseUrl: chat.baseUrl };
  }

  // Embeddings on the provider being connected share its credentials; on any
  // other they need a key of their own.
  if (explicit.provider === chat.provider) {
    return { ...explicit, apiKey: chat.apiKey, baseUrl: chat.baseUrl };
  }

  const spec = PROVIDERS[explicit.provider];
  if (spec.requiresApiKey && !explicit.apiKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${spec.label} requires an API key to embed your documents.`,
    });
  }

  return { ...explicit, baseUrl: null };
}

/**
 * Connects a provider, or updates the connection that is already there.
 *
 * The workspace's first provider also decides the embedding model and creates
 * the search index; later ones only add themselves to the list. Either way the
 * default chat model is left alone unless it would be left pointing at a model
 * this call just disabled.
 */
export async function connectProvider(
  ctx: Context & { organizationId: string },
  input: ConnectInput,
): Promise<{ organizationId: string }> {
  const { organizationId } = ctx;
  const spec = PROVIDERS[input.provider];

  // Every enabled model has to be one we know how to call.
  const known = new Set(spec.chatModels.map((model) => model.id));
  const unknown = input.models.filter((model) => !known.has(model));
  if (unknown.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${spec.label} does not serve ${unknown.join(", ")}.`,
    });
  }

  const existing = await ctx.db.query.llmProvider.findFirst({
    where: and(
      eq(llmProvider.organizationId, organizationId),
      eq(llmProvider.provider, input.provider),
    ),
  });

  // Editing a connection does not require retyping the key: a blank field
  // means "keep the one you already have", since we never send it back out.
  const apiKey = input.apiKey ?? existing?.apiKey ?? null;
  const baseUrl = input.baseUrl ?? existing?.baseUrl ?? null;

  // Reject a missing credential here rather than letting the first request
  // fail with a confusing error much later. A self-hosted provider needs an
  // endpoint instead; a key stands in for one when it points at the cloud.
  if (spec.selfHosted) {
    if (!baseUrl && !apiKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${spec.label} needs either an endpoint to reach or a cloud API key.`,
      });
    }
  } else if (spec.requiresApiKey && !apiKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${spec.label} requires an API key.`,
    });
  }

  const values = {
    organizationId,
    provider: input.provider,
    apiKey,
    baseUrl,
    chatModels: input.models,
    autoUpdateModels: input.autoUpdateModels,
  };

  await ctx.db
    .insert(llmProvider)
    .values({ id: randomUUID(), ...values })
    .onConflictDoUpdate({
      target: [llmProvider.organizationId, llmProvider.provider],
      set: values,
    });

  const config = await ctx.db.query.llmConfig.findFirst({
    where: eq(llmConfig.organizationId, organizationId),
  });

  // The first provider settles the embedding model too, and the index it
  // implies is created up front so the first upload does not pay for it.
  if (!config) {
    const embedding = resolveEmbedding(
      { provider: input.provider, apiKey, baseUrl },
      input.embedding,
    );
    const embeddingSpec = findEmbeddingModel(embedding.provider, embedding.model);
    if (!embeddingSpec) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown embedding model "${embedding.model}".`,
      });
    }

    await ctx.db.insert(llmConfig).values({
      id: randomUUID(),
      organizationId,
      chatProvider: input.provider,
      chatModel: input.models[0]!,
      embeddingProvider: embedding.provider,
      embeddingModel: embedding.model,
      embeddingApiKey: embedding.apiKey,
      embeddingBaseUrl: embedding.baseUrl,
      embeddingDimension: String(embeddingSpec.dimension),
      indexName: getIndexName(embedding.model),
    });

    const index = ctx.getDocumentIndex(embedding.model, embeddingSpec.dimension);
    await index.ensureReady();

    return { organizationId };
  }

  const patch: Partial<typeof llmConfig.$inferInsert> = {};

  // Embedding credentials are copied onto the config because the indexing
  // worker reads them from there; a rotated key has to reach that copy too.
  if (config.embeddingProvider === input.provider) {
    patch.embeddingApiKey = apiKey;
    patch.embeddingBaseUrl = baseUrl;
  }

  // Disabling the model the workspace answers with moves the default to the
  // first one that survived rather than leaving a dangling pointer.
  if (config.chatProvider === input.provider && !input.models.includes(config.chatModel)) {
    patch.chatModel = input.models[0]!;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(llmConfig)
      .set(patch)
      .where(eq(llmConfig.organizationId, organizationId));
  }

  return { organizationId };
}

export const modelsRouter = router({
  /**
   * Everything the Language Models page draws: what is connected, what can
   * still be added, and which model is the default.
   *
   * Keys are never returned — only whether one is held, and by whom.
   */
  overview: orgProcedure.query(async ({ ctx }) => {
    const connected = await ctx.db.query.llmProvider.findMany({
      where: eq(llmProvider.organizationId, ctx.organizationId),
    });

    const config = await ctx.db.query.llmConfig.findFirst({
      where: eq(llmConfig.organizationId, ctx.organizationId),
    });

    return {
      default: config
        ? { provider: config.chatProvider, model: config.chatModel }
        : null,
      embedding: config
        ? {
            provider: config.embeddingProvider,
            model: config.embeddingModel,
            dimension: config.embeddingDimension,
          }
        : null,
      providers: connected
        .filter((row): row is typeof row & { provider: ProviderId } =>
          Object.hasOwn(PROVIDERS, row.provider),
        )
        .map((row) => {
          const spec = PROVIDERS[row.provider];
          return {
            id: row.provider,
            label: spec.label,
            description: spec.description,
            baseUrl: row.baseUrl,
            /** Whether a key is stored, so the dialog can say so without it. */
            hasApiKey: Boolean(row.apiKey),
            /** A connection with no key cannot answer; the page says so. */
            needsApiKey: spec.requiresApiKey && !row.apiKey,
            autoUpdateModels: row.autoUpdateModels,
            // Catalog order, and catalog labels, so a model the workspace
            // enabled before we renamed it still reads correctly.
            models: spec.chatModels.filter((model) =>
              row.chatModels.includes(model.id),
            ),
          };
        }),
    };
  }),

  /** Connect a new provider, or re-save the settings of a connected one. */
  connect: adminProcedure
    .input(connectInput)
    .mutation(({ ctx, input }) => connectProvider(ctx, input)),

  /** Point the workspace at a different default chat model. */
  setDefault: adminProcedure
    .input(z.object({ provider: providerIdSchema, model: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.llmProvider.findFirst({
        where: and(
          eq(llmProvider.organizationId, ctx.organizationId),
          eq(llmProvider.provider, input.provider),
        ),
      });

      if (!row || !row.chatModels.includes(input.model)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That model is not enabled on a connected provider.",
        });
      }

      await ctx.db
        .update(llmConfig)
        .set({ chatProvider: input.provider, chatModel: input.model })
        .where(eq(llmConfig.organizationId, ctx.organizationId));

      return { provider: input.provider, model: input.model };
    }),

  /**
   * Disconnect a provider and forget its key.
   *
   * The last one cannot go this way: a workspace with no provider cannot
   * answer anything, and "Reset all settings" is the honest way to say that.
   */
  disconnect: adminProcedure
    .input(z.object({ provider: providerIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.query.llmProvider.findMany({
        where: eq(llmProvider.organizationId, ctx.organizationId),
      });

      const target = rows.find((row) => row.provider === input.provider);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Provider not connected." });
      }
      if (rows.length === 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This is the only connected provider. Connect another one first, or reset all settings.",
        });
      }

      await ctx.db.delete(llmProvider).where(eq(llmProvider.id, target.id));

      // The default has to land somewhere it can still be served.
      const config = await ctx.db.query.llmConfig.findFirst({
        where: eq(llmConfig.organizationId, ctx.organizationId),
      });

      if (config?.chatProvider === input.provider) {
        const fallback = rows.find(
          (row) => row.provider !== input.provider && row.chatModels.length > 0,
        );
        if (fallback) {
          await ctx.db
            .update(llmConfig)
            .set({ chatProvider: fallback.provider, chatModel: fallback.chatModels[0]! })
            .where(eq(llmConfig.organizationId, ctx.organizationId));
        }
      }

      return { provider: input.provider };
    }),
});
