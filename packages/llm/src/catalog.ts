/**
 * Supported model providers.
 *
 * Onirix is positioned as private-by-design and self-hostable, so no provider
 * is privileged: a workspace connects as many as it likes from the admin
 * dashboard, each with a key its own admin pasted. Ollama is included so a
 * deployment can run with no outbound calls at all.
 */
import { z } from "zod";

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
};

export type EmbeddingModelSpec = {
  id: string;
  label: string;
  /**
   * Vector dimension. Baked into the OpenSearch mapping at index creation, so
   * changing the embedding model requires reindexing rather than a hot swap.
   */
  dimension: number;
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  description: string;
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
    description: "GPT models via the OpenAI API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "gpt-5", label: "GPT-5", reasons: true },
      { id: "gpt-5-mini", label: "GPT-5 mini", reasons: true },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
    embeddingModels: [
      { id: "text-embedding-3-small", label: "Embedding 3 small", dimension: 1536 },
      { id: "text-embedding-3-large", label: "Embedding 3 large", dimension: 3072 },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models via the Anthropic API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "claude-opus-5", label: "Claude Opus 5", reasons: true },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", reasons: true },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", reasons: true },
    ],
    // Anthropic serves no embedding model; pair it with another provider.
    embeddingModels: [],
  },
  google: {
    id: "google",
    label: "Google",
    description: "Gemini models via the Google Generative AI API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", reasons: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", reasons: true },
    ],
    embeddingModels: [
      { id: "text-embedding-004", label: "Text Embedding 004", dimension: 768 },
    ],
  },
  xai: {
    id: "xai",
    label: "xAI",
    description: "Grok models via the xAI API.",
    requiresApiKey: true,
    selfHosted: false,
    chatModels: [
      { id: "grok-4", label: "Grok 4", reasons: true },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini", reasons: true },
    ],
    // xAI serves no embedding model; pair it with another provider.
    embeddingModels: [],
  },
  ollama: {
    id: "ollama",
    label: "Ollama (self-hosted)",
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
    chatModels: [
      { id: "llama3.3", label: "Llama 3.3" },
      { id: "qwen2.5", label: "Qwen 2.5" },
      { id: "mistral", label: "Mistral" },
    ],
    embeddingModels: [
      { id: "nomic-embed-text", label: "Nomic Embed Text", dimension: 768 },
      { id: "mxbai-embed-large", label: "MxBai Embed Large", dimension: 1024 },
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
