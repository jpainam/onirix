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
import type { EmbeddingModel, JSONValue, LanguageModel } from "ai";

import { PROVIDERS, modelReasons, type ProviderId } from "./catalog";

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

/**
 * How long a model may spend thinking before it starts answering.
 *
 * Reasoning is the dominant cost in time-to-first-token, and most of what
 * Onirix asks a model to do does not need it. `"off"` is for the secondary
 * flows — rewriting a query, naming a conversation — which are single-sentence
 * transformations of text the caller already has. `"low"` is for the grounded
 * answer: retrieval has already found the passages, so the model is
 * summarizing and citing rather than working anything out.
 */
export type ReasoningEffort = "off" | "low";

/** A `providerOptions` fragment: one entry per provider it applies to. */
export type ReasoningProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Translates an effort into the provider's own dialect.
 *
 * Returns `{}` for models with no reasoning stage, which is not merely a
 * no-op: OpenAI rejects `reasoning_effort` outright on a non-reasoning model,
 * so a workspace pointed at GPT-4.1 would fail every call rather than answer
 * slightly slower.
 *
 * Spread into `providerOptions` at the call site rather than baked into the
 * model instance, since the same workspace model serves both efforts.
 */
export function reasoningEffortOptions(
  credentials: ProviderCredentials,
  modelId: string,
  effort: ReasoningEffort,
): ReasoningProviderOptions {
  if (!modelReasons(credentials.provider, modelId)) return {};

  switch (credentials.provider) {
    case "openai":
      // `minimal` rather than `none`: GPT-5 predates `none` and errors on it,
      // and the difference between them is not worth splitting the catalog.
      return { openai: { reasoningEffort: effort === "off" ? "minimal" : "low" } };

    case "xai":
      return { xai: { reasoningEffort: effort === "off" ? "none" : "low" } };

    case "anthropic":
      // Extended thinking is opt-in, and neither of these flows opts in. Saying
      // so explicitly keeps a model that starts thinking by default from
      // quietly reintroducing the latency this exists to remove.
      return { anthropic: { thinking: { type: "disabled" } } };

    case "google":
      // Gemini takes a token budget, and 2.5 Pro refuses to be switched off
      // entirely — the lowest it accepts is 128, so `off` means `as little as
      // the model allows` rather than `none`.
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: modelId.includes("pro") ? 128 : effort === "off" ? 0 : 512,
          },
        },
      };

    case "ollama":
      // An OpenAI-compatible endpoint that is not OpenAI; it has no agreed
      // spelling for this, and sending one risks a 400 from whatever is behind
      // the URL.
      return {};
  }
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
