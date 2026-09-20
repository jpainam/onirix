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
import { openNullable, sealNullable } from "@onirix/db/secrets";
import {
  PROVIDERS,
  type ProviderId,
  deleteOllamaModel,
  findEmbeddingModel,
  isDownloadableModel,
  listOllamaModels,
  ollamaOrigin,
  providerIdSchema,
} from "@onirix/llm";
import { getIndexName } from "@onirix/search";

import { orgProcedure, permissionProcedure, router } from "../index";
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
  // Resolved in the clear, then sealed once below, so a key kept from a row
  // written before encryption comes out sealed like a new one.
  const apiKeyPlain = input.apiKey ?? openNullable(ctx.secrets, existing?.apiKey);
  const apiKey = sealNullable(ctx.secrets, apiKeyPlain);
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
    // The embedding key is resolved in the clear (an explicit one arrives from
    // the form) and sealed when it is written.
    const embedding = resolveEmbedding(
      { provider: input.provider, apiKey: apiKeyPlain, baseUrl },
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
      embeddingApiKey: sealNullable(ctx.secrets, embedding.apiKey),
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
    // Already sealed above; the same ciphertext serves both rows.
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

/**
 * The workspace's Ollama connection, as the model browser needs it.
 *
 * Exported for the download route, which streams and so cannot be a tRPC
 * procedure, but must agree with these about which Ollama is the workspace's.
 */
export async function ollamaConnection(
  ctx: Pick<Context, "db"> & { organizationId: string },
): Promise<
  | { state: "none" | "cloud"; row: null | typeof llmProvider.$inferSelect; origin: null }
  | { state: "connected"; row: typeof llmProvider.$inferSelect; origin: string }
> {
  const row = await ctx.db.query.llmProvider.findFirst({
    where: and(
      eq(llmProvider.organizationId, ctx.organizationId),
      eq(llmProvider.provider, "ollama"),
    ),
  });
  if (!row) return { state: "none", row: null, origin: null };

  const origin = ollamaOrigin(row.baseUrl);
  // Ollama Cloud serves its models itself; there is no disk of ours to fill.
  if (!origin || row.baseUrl === PROVIDERS.ollama.cloud?.baseUrl) {
    return { state: "cloud", row, origin: null };
  }
  return { state: "connected", row, origin };
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
  connect: permissionProcedure("model", "update")
    .input(connectInput)
    .mutation(({ ctx, input }) => connectProvider(ctx, input)),

  /**
   * Asks an OpenAI-compatible endpoint what it serves, from where the server
   * stands.
   *
   * The vantage point is the point. A self-hosted endpoint is called by this
   * server, not by the admin's browser, so "it works on my machine" says
   * nothing: `localhost` inside a container is the container. The dialog uses
   * this to test an address before saving it, and the desktop app uses it to
   * find which of the host's names this server can reach a local runtime by.
   *
   * Only model ids parsed from a well-formed listing are returned, never the
   * response itself, so this cannot be used to read arbitrary internal URLs.
   */
  probe: permissionProcedure("model", "update")
    .input(z.object({ baseUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const unreachable = { reachable: false, models: [] as string[] };

      let url: URL;
      try {
        url = new URL(`${input.baseUrl.replace(/\/+$/, "")}/models`);
      } catch {
        return unreachable;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return unreachable;

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return unreachable;
        const body = (await response.json()) as { data?: { id?: unknown }[] };
        if (!Array.isArray(body.data)) return unreachable;
        return {
          reachable: true,
          // Ollama lists `qwen2.5:latest`; the catalog calls it `qwen2.5`.
          models: body.data
            .map((model) => model.id)
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.replace(/:latest$/, "")),
        };
      } catch {
        return unreachable;
      }
    }),

  /**
   * What the Open Models page draws: whether this workspace has an Ollama to
   * download into, what is on its disk, and which of those are enabled.
   *
   * Models download onto the machine that runs Ollama, and it is this server
   * that talks to it, so any admin can do this from any browser. `none` and
   * `cloud` are the cases where there is no such machine.
   */
  library: orgProcedure.query(async ({ ctx }) => {
    const connection = await ollamaConnection(ctx);
    const config = await ctx.db.query.llmConfig.findFirst({
      where: eq(llmConfig.organizationId, ctx.organizationId),
    });
    const base = {
      baseUrl: connection.row?.baseUrl ?? null,
      enabled: connection.row?.chatModels ?? [],
      defaultModel: config?.chatProvider === "ollama" ? config.chatModel : null,
    };

    if (connection.state !== "connected") {
      return { ...base, state: connection.state, installed: [] };
    }
    const installed = await listOllamaModels(connection.origin);
    return installed
      ? { ...base, state: "ready" as const, installed }
      : { ...base, state: "unreachable" as const, installed: [] };
  }),

  /** Offer a downloaded model to the workspace, or stop offering it. */
  setEnabled: permissionProcedure("model", "update")
    .input(z.object({ model: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ollamaConnection(ctx);
      if (!connection.row) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ollama is not connected." });
      }

      if (input.enabled && connection.state === "connected") {
        const installed = await listOllamaModels(connection.origin);
        if (installed && !installed.some((model) => model.name === input.model)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Download this model before enabling it.",
          });
        }
      }

      const current = connection.row.chatModels;
      // Catalog order, so the default a workspace falls back to is stable.
      const next = PROVIDERS.ollama.chatModels
        .map((model) => model.id)
        .filter((id) => (id === input.model ? input.enabled : current.includes(id)));
      if (next.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This is the only model enabled on Ollama. Enable another one first, or disconnect Ollama.",
        });
      }

      await connectProvider(ctx, {
        provider: "ollama",
        models: next,
        apiKey: null,
        baseUrl: null,
        autoUpdateModels: connection.row.autoUpdateModels,
        embedding: null,
      });
      return { enabled: next };
    }),

  /** Delete a downloaded model from the disk of the workspace's Ollama. */
  removeDownloaded: permissionProcedure("model", "update")
    .input(z.object({ model: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ollamaConnection(ctx);
      if (connection.state !== "connected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ollama is not connected." });
      }
      // The same rule as downloads: only names the catalog lists reach Ollama.
      if (!isDownloadableModel(input.model)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown model." });
      }
      if (connection.row.chatModels.includes(input.model)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This model is enabled for the workspace. Disable it first.",
        });
      }

      try {
        await deleteOllamaModel(connection.origin, input.model);
      } catch (failure) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: failure instanceof Error ? failure.message : "Ollama could not remove it.",
        });
      }
      return { model: input.model };
    }),

  /** Point the workspace at a different default chat model. */
  setDefault: permissionProcedure("model", "update")
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
  disconnect: permissionProcedure("model", "update")
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
