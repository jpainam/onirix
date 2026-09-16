/**
 * Builds AI SDK model instances from a workspace's stored configuration.
 *
 * Everything downstream — chat, embedding, summarization — goes through here,
 * so swapping providers never touches call sites.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import type { EmbeddingModel, LanguageModel } from "ai";

import { PROVIDERS, type ProviderId } from "./catalog";

/**
 * How to reach one provider. Keys are always the workspace's own — Onirix
 * holds no deployment-wide credentials, so there is nowhere else to look.
 */
export type ProviderCredentials = {
  provider: ProviderId;
  apiKey: string | null;
  baseUrl: string | null;
};

function assertApiKey(credentials: ProviderCredentials): string {
  if (!credentials.apiKey) {
    throw new Error(
      `${PROVIDERS[credentials.provider].label} requires an API key, but none is configured.`,
    );
  }
  return credentials.apiKey;
}

export function createChatModel(
  credentials: ProviderCredentials,
  modelId: string,
): LanguageModel {
  switch (credentials.provider) {
    case "openai":
      return createOpenAI({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      })(modelId);

    case "anthropic":
      return createAnthropic({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      })(modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      })(modelId);

    case "xai":
      return createXai({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      })(modelId);

    case "ollama":
      // Ollama exposes an OpenAI-compatible surface; it ignores the API key.
      return createOpenAICompatible({
        name: "ollama",
        baseURL: credentials.baseUrl ?? PROVIDERS.ollama.defaultBaseUrl!,
        apiKey: credentials.apiKey ?? "ollama",
      })(modelId);
  }
}

export function createEmbeddingModel(
  credentials: ProviderCredentials,
  modelId: string,
): EmbeddingModel {
  switch (credentials.provider) {
    case "openai":
      return createOpenAI({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      }).textEmbeddingModel(modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey: assertApiKey(credentials),
        ...(credentials.baseUrl ? { baseURL: credentials.baseUrl } : {}),
      }).textEmbeddingModel(modelId);

    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: credentials.baseUrl ?? PROVIDERS.ollama.defaultBaseUrl!,
        apiKey: credentials.apiKey ?? "ollama",
      }).textEmbeddingModel(modelId);

    case "anthropic":
    case "xai":
      throw new Error(
        `${PROVIDERS[credentials.provider].label} does not provide embedding models. ` +
          "Configure a separate embedding provider.",
      );
  }
}
