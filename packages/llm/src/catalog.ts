/**
 * Supported model providers.
 *
 * Onirix is positioned as private-by-design and self-hostable, so no provider
 * is privileged: a workspace connects as many as it likes from the admin
 * dashboard, each with a key its own admin pasted. Ollama is included so a
 * deployment can run with no outbound calls at all.
 */
import { z } from "zod";

import { OPEN_MODELS } from "./open-models";

export const PROVIDER_IDS = ["openai", "anthropic", "google", "xai", "ollama"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export type ChatModelSpec = {
  id: string;
  label: string;
  /**
   * Set on models that reason before they answer.
   *
   * This is a capability flag, not a setting: providers reject the reasoning
   * parameter outright on models that have no reasoning stage, so nothing may
   * send it without checking here first. How far down each provider turns it —
   * a named effort, a token budget — is their own dialect, and translating it
   * is `reasoningEffortOptions`'s job in `factory.ts`.
   */
  reasons?: boolean;
  /**
   * Approximate size on disk of the default tag, in GB. Only set where the
   * model is something a user downloads, so the desktop app can say what a
   * click costs before it starts. The real figure arrives with the download.
   */
  downloadGb?: number;
};

export type EmbeddingModelSpec = {
  id: string;
  label: string;
  /**
   * Vector dimension. Baked into the OpenSearch mapping at index creation, so
   * changing the embedding model requires reindexing rather than a hot swap.
   */
  dimension: number;
  /** As on `ChatModelSpec`. */
  downloadGb?: number;
};

/**
 * What a provider's own web search can be asked to do (`web-search.ts`).
 *
 * `sites` searches and keeps to a list of websites when given one.
 * `all-or-nothing` searches the whole web or not at all. `none` has no search
 * this code can switch on.
 */
export type WebSearchSupport = "sites" | "all-or-nothing" | "none";

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  description: string;
  webSearch: WebSearchSupport;
  /** False for providers that run locally and need no credential. */
  requiresApiKey: boolean;
  /** True when the deployment can reach it without leaving the network. */
  selfHosted: boolean;
  /** Present when the endpoint is user-configurable (self-hosted, proxies). */
  defaultBaseUrl?: string;
  /** Wording for the self-hosted mode in the setup dialog. */
  selfHostedLabel?: string;
  /**
   * Set when the same models are also offered as a hosted API, so setup can
   * offer both modes: an endpoint you run, or a key against their cloud.
   */
  cloud?: {
    label: string;
    baseUrl: string;
  };
  chatModels: ChatModelSpec[];
  embeddingModels: EmbeddingModelSpec[];
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    webSearch: "sites",
    description: "GPT models via the OpenAI API.",
    requiresApiKey: true,
    selfHosted: false,
    // The first entry is what a new setup starts on, so it is the everyday
    // flagship rather than the dearest model on the list.
    chatModels: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", reasons: true },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", reasons: true },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", reasons: true },
      { id: "gpt-6-astra", label: "GPT-6 Astra", reasons: true },
    ],
    embeddingModels: [
      { id: "text-embedding-3-small", label: "Embedding 3 small", dimension: 1536 },
      { id: "text-embedding-3-large", label: "Embedding 3 large", dimension: 3072 },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    webSearch: "sites",
    description: "Claude models via the Anthropic API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "claude-opus-5", label: "Claude Opus 5", reasons: true },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", reasons: true },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", reasons: true },
      { id: "claude-fable-5-1", label: "Claude Fable 5.1", reasons: true },
    ],
    // Anthropic serves no embedding model; pair it with another provider.
    embeddingModels: [],
  },
  google: {
    id: "google",
    label: "Google",
    webSearch: "all-or-nothing",
    description: "Gemini models via the Google Generative AI API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", reasons: true },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", reasons: true },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", reasons: true },
    ],
    // `text-embedding-004` was shut down in January 2026. This is its
    // successor at its default size; the factory asks for no other.
    embeddingModels: [
      { id: "gemini-embedding-001", label: "Gemini Embedding", dimension: 3072 },
    ],
  },
  xai: {
    id: "xai",
    label: "xAI",
    // Its search tool belongs to its Responses API, and the factory builds its
    // chat model.
    webSearch: "none",
    description: "Grok models via the xAI API.",
    requiresApiKey: true,
    selfHosted: false,
    // Grok 4.20 comes as two ids instead of one model with a setting, and
    // both reject the reasoning parameter, so neither is marked `reasons`.
    chatModels: [
      { id: "grok-4.6", label: "Grok 4.6", reasons: true },
      { id: "grok-4.5", label: "Grok 4.5", reasons: true },
      { id: "grok-4.20-non-reasoning", label: "Grok 4.20 (no reasoning)" },
    ],
    // xAI serves no embedding model; pair it with another provider.
    embeddingModels: [],
  },
  ollama: {
    id: "ollama",
    label: "Ollama (self-hosted)",
    webSearch: "none",
    description: "Models running on your own infrastructure. No data leaves your network.",
    requiresApiKey: false,
    selfHosted: true,
    // Onirix runs in a container, so `localhost` would resolve to the
    // container itself rather than the host running Ollama.
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
    selfHostedLabel: "Self-hosted Ollama",
    cloud: {
      label: "Ollama Cloud",
      baseUrl: "https://ollama.com/v1",
    },
    // One list serves both this and the model browser; see `open-models.ts`
    // for why its order is fixed. Ids are Ollama library tags.
    chatModels: OPEN_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      ...(model.capabilities.includes("reasoning") ? { reasons: true } : {}),
      downloadGb: model.downloadGb,
    })),
    embeddingModels: [
      { id: "nomic-embed-text", label: "Nomic Embed Text", dimension: 768, downloadGb: 0.3 },
      { id: "mxbai-embed-large", label: "MxBai Embed Large", dimension: 1024, downloadGb: 0.7 },
    ],
  },
};

export function getProvider(id: ProviderId): ProviderSpec {
  return PROVIDERS[id];
}

/** Providers that can serve embeddings, for the onboarding picker. */
export function embeddingCapableProviders(): ProviderSpec[] {
  return Object.values(PROVIDERS).filter((p) => p.embeddingModels.length > 0);
}

/**
 * Whether a chat model reasons before answering.
 *
 * Unknown ids answer `false`: a workspace may point at a model the catalog has
 * never heard of, and sending a reasoning parameter to one that cannot take it
 * fails the whole call, where omitting it only leaves latency on the table.
 */
export function modelReasons(provider: ProviderId, modelId: string): boolean {
  return PROVIDERS[provider].chatModels.some(
    (model) => model.id === modelId && model.reasons === true,
  );
}

export function findEmbeddingModel(
  provider: ProviderId,
  modelId: string,
): EmbeddingModelSpec | undefined {
  return PROVIDERS[provider].embeddingModels.find((m) => m.id === modelId);
}
