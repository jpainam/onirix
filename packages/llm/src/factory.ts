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

import { type AnswerEffort, PROVIDERS, modelReasons, type ProviderId } from "./catalog";

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
 * transformations of text the caller already has. The rest are for the
 * grounded answer, and which one is the workspace's choice (`AnswerEffort`).
 * It starts at `"low"`: retrieval has already found the passages, so the model
 * is summarizing and citing rather than working anything out.
 */
export type ReasoningEffort = "off" | AnswerEffort;

/**
 * Haiku 4.5 thinks to a token budget, not a level. `low` has no entry: its
 * thinking is opt-in, and `low` does not opt in.
 */
const HAIKU_THINKING_BUDGET = { medium: 2048, high: 8192 } as const;

/** A `providerOptions` fragment: one entry per provider it applies to. */
export type ReasoningProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Translates an effort into the provider's own dialect.
 *
 * Returns `{}` for models with no reasoning stage, which is not merely a
 * no-op: providers reject the reasoning parameter outright on a model that
 * cannot take it, so a workspace pointed at one would fail every call rather
 * than answer slightly slower.
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
      // GPT-5.6 can be told not to reason at all. GPT-6 cannot, and rejects
      // `none`, so there `off` means as little as the model allows.
      return {
        openai: {
          reasoningEffort:
            effort !== "off" ? effort : modelId.startsWith("gpt-6") ? "low" : "none",
        },
      };

    case "xai":
      // Grok 4.5 and 4.6 start at `low` and reject `none`.
      return { xai: { reasoningEffort: effort === "off" ? "low" : effort } };

    case "anthropic":
      // Fable always thinks and answers `disabled` with a 400, so effort is
      // the only dial it has.
      if (modelId.startsWith("claude-fable")) {
        return { anthropic: { effort: effort === "off" ? "low" : effort } };
      }
      // Haiku 4.5 predates effort and rejects it. Its thinking is opt-in, and
      // saying so explicitly keeps that from changing under us.
      if (modelId.startsWith("claude-haiku")) {
        return effort === "off" || effort === "low"
          ? { anthropic: { thinking: { type: "disabled" } } }
          : {
              anthropic: {
                thinking: { type: "enabled", budgetTokens: HAIKU_THINKING_BUDGET[effort] },
              },
            };
      }
      // Opus 5 and Sonnet 5 think by default. Off is safe for the one-line
      // flows, but the answer calls tools, and with thinking disabled these
      // models sometimes write a tool call out as text instead of making it.
      // Thinking stays on there, turned down.
      return effort === "off"
        ? { anthropic: { thinking: { type: "disabled" } } }
        : { anthropic: { effort } };

    case "google":
      // Gemini 3 takes a level where 2.5 took a token budget, and has no off.
      // `low` is the least every model in the catalog accepts.
      return { google: { thinkingConfig: { thinkingLevel: effort === "off" ? "low" : effort } } };

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
