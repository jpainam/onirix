/**
 * Supported model providers.
 *
 * Onirix is positioned as private-by-design and self-hostable, so no provider
 * is privileged: the workspace owner picks one during onboarding and it can be
 * changed later. Ollama is included so a deployment can run with no outbound
 * calls at all.
 */
import { z } from "zod";

export const PROVIDER_IDS = ["openai", "anthropic", "google", "xai", "ollama"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export type ChatModelSpec = {
  id: string;
  label: string;
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
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
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
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
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
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
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
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
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
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
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

export function findEmbeddingModel(
  provider: ProviderId,
  modelId: string,
): EmbeddingModelSpec | undefined {
  return PROVIDERS[provider].embeddingModels.find((m) => m.id === modelId);
}

/**
 * Environment variable holding a server-provided key for each provider, if any.
 *
 * When the deployment supplies a key, onboarding offers the provider without
 * asking the user to paste one, and nothing is copied into the database — the
 * key is read from the environment at call time instead.
 */
export const PROVIDER_ENV_KEY: Record<ProviderId, string | null> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  ollama: null,
};

/** Providers the deployment can offer without the user supplying a key. */
export function providersWithServerKey(env: Record<string, string | undefined>): Set<ProviderId> {
  const available = new Set<ProviderId>();
  for (const id of PROVIDER_IDS) {
    const envKey = PROVIDER_ENV_KEY[id];
    if (envKey && env[envKey]) available.add(id);
  }
  return available;
}
