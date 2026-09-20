/**
 * Answers a local chat.
 *
 * The renderer has no network access, so the model call is made here, and the
 * answer crosses to the window as it arrives. The same factory the server uses
 * builds the model (`@onirix/llm`), so a provider behaves in local mode the
 * way it does in a workspace.
 *
 * When the session has documents attached, the answer is grounded in them the
 * way a workspace answer is: the best passages are found on this computer
 * (local-documents.ts), handed to the model as numbered sources, and cited
 * inline as [1], [2], so every claim can be checked against the passage it
 * came from. Only those few passages go to the model, never whole files.
 * How an answer is written comes from the local skills (local-skills.ts).
 * There are no tools here: charts and database sources are a server's.
 */
import { APICallError, type ModelMessage, generateText, streamText } from "ai";

import { PROVIDERS } from "@onirix/llm/catalog";
import {
  type ProviderCredentials,
  createChatModel,
  reasoningEffortOptions,
} from "@onirix/llm/factory";

import type {
  ApiProviderId,
  Chat,
  ChatFailure,
  ChatStreamEvent,
  MessageSource,
  SendResult,
} from "./local-bridge";
import * as documents from "./local-documents";
import * as localModel from "./local-model";
import * as skills from "./local-skills";
import * as store from "./local-store";

const IDENTITY = [
  "You are Onirix, a private AI assistant running in a desktop app on the person's own computer.",
  "You are truthful, precise, and concise.",
].join(" ");

/** With nothing attached, the honest position is that there is nothing to read. */
const NO_DOCUMENTS = [
  "No documents are attached to this conversation, and you cannot see the person's files or the internet.",
  "If a question needs those, say so plainly and mention that documents can be attached from the panel on the right.",
].join(" ");

/** How many passages an answer reads. Enough to answer from, few enough to fit
 *  the context of a small local model alongside the conversation. */
const SOURCE_LIMIT = 6;

/**
 * Grounding, citations and style are skills now, so what is sent is whatever
 * the person has left switched on. The two that only mean something beside
 * documents are left out when there are none.
 */
function systemPrompt(sources: MessageSource[]): string {
  const guidance = skills.promptFor({ hasContext: sources.length > 0 });
  if (sources.length === 0) {
    return [IDENTITY, NO_DOCUMENTS, guidance].filter(Boolean).join("\n\n");
  }
  // The same block shape the server sends (`buildContextBlock` in
  // packages/llm/src/prompts.ts), so a model behaves the same in both. Only
  // the framing differs: these are one person's files, not an organization's.
  const rendered = sources
    .map((source) =>
      [
        `<document index="${source.index}">`,
        `<title>${source.location ? `${source.title} (${source.location})` : source.title}</title>`,
        "<content>",
        source.passage,
        "</content>",
        "</document>",
      ].join("\n"),
    )
    .join("\n\n");
  const context = `Here are the most relevant passages from the documents attached to this conversation:\n\n${rendered}`;
  return [IDENTITY, guidance, context].filter(Boolean).join("\n\n");
}

/**
 * What to search the documents for. The last question, plus the one before it:
 * a follow-up like "and for contractors?" carries its subject in the previous
 * turn. The server rewrites the query with a model call; here a second call
 * would double the wait on a local model, so the cheap version stands in.
 */
function retrievalQuery(chat: Chat): string {
  return chat.messages
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => message.text)
    .join("\n");
}

/** A long chat is sent whole up to here; beyond it the oldest turns drop off. */
const HISTORY_MESSAGES = 40;

export const NO_MODEL: ChatFailure = {
  code: "no-model",
  message: "No language model is set up.",
};

type Emit = (event: ChatStreamEvent) => void;

/** One answer in flight per chat. A second send waits for the first to end. */
const running = new Map<string, AbortController>();

/**
 * Turns a provider failure into a sentence a person can act on.
 *
 * The SDK's own messages are written for developers ("Incorrect API key
 * provided: sk-...") and sometimes echo part of the key, so the status code is
 * what gets read, and the provider's text is used only as a last resort.
 */
export function explain(error: unknown, label: string, model: string): string {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 400:
        return `${label} rejected the request for ${model}. The model may not be available to this key.`;
      case 401:
      case 403:
        return `${label} did not accept this API key. Check that it was copied whole and has not been revoked.`;
      case 402:
        return `${label} says this account has no credit left.`;
      case 404:
        return `${label} does not offer ${model} to this key. Pick another model.`;
      case 429:
        return `${label} is refusing requests from this key for now (rate limit or quota). Try again later, or check the account's billing.`;
      case undefined:
        return `Could not reach ${label}. Check the internet connection and try again.`;
      default:
        if (error.statusCode >= 500) {
          return `${label} is having trouble right now (HTTP ${error.statusCode}). Try again in a moment.`;
        }
        return `${label} answered with an error (HTTP ${error.statusCode}).`;
    }
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return `${label} took too long to answer. Try again.`;
  }
  return `Could not reach ${label}. Check the internet connection and try again.`;
}

function explainFor(error: unknown, credentials: ProviderCredentials, model: string): string {
  if (credentials.provider === "ollama") {
    if (APICallError.isInstance(error) && error.statusCode === 404) {
      return `${model} is not downloaded on this computer. Download it again from Settings, or pick another model.`;
    }
    if (APICallError.isInstance(error) && error.statusCode !== undefined) {
      return `The local model could not answer (HTTP ${error.statusCode}). It may be too large for this computer's memory.`;
    }
    return "The local model runtime is not running. Start it from Settings, then try again.";
  }
  return explain(error, PROVIDERS[credentials.provider].label, model);
}

/**
 * Proves a key works before it is saved: one request, a few tokens.
 *
 * A key that is saved unchecked fails later, in the middle of a conversation,
 * where the cause is much harder to see than on the form it was pasted into.
 */
export async function validateApiKey(
  provider: ApiProviderId,
  model: string,
  apiKey: string,
): Promise<void> {
  const credentials: ProviderCredentials = { provider, apiKey, baseUrl: null };
  try {
    await generateText({
      model: createChatModel(credentials, model),
      prompt: "Reply with the single word: ok",
      // Room for a reasoning model to think its minimum and still say a word.
      maxOutputTokens: 256,
      maxRetries: 0,
      providerOptions: reasoningEffortOptions(credentials, model, "off"),
      abortSignal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(explain(error, PROVIDERS[provider].label, model));
  }
}

function toModelMessages(chat: Chat): ModelMessage[] {
  return chat.messages
    .slice(-HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, content: message.text }));
}

/**
 * Starts answering the last message of a chat, which must be the person's.
 *
 * Returns as soon as the outcome is known to be "streaming" or "cannot": the
 * answer itself arrives through `emit`. A missing model is not an exception.
 * It is the expected state of an app whose setup was skipped, and the window
 * shows it inline with a way to fix it.
 */
function answer(chat: Chat, emit: Emit): SendResult {
  let configured: ReturnType<typeof localModel.credentials>;
  try {
    configured = localModel.credentials();
  } catch (error) {
    return {
      chat,
      streaming: false,
      failure: { code: "failed", message: error instanceof Error ? error.message : String(error) },
    };
  }
  if (!configured) return { chat, streaming: false, failure: NO_MODEL };

  const { credentials, model } = configured;
  const controller = new AbortController();
  running.set(chat.id, controller);

  const sources = documents.retrieve(chat.documentIds, retrievalQuery(chat), SOURCE_LIMIT);
  if (sources.length > 0) emit({ type: "sources", chatId: chat.id, sources });

  void (async () => {
    let text = "";
    let failure: ChatFailure | null = null;
    try {
      const result = streamText({
        model: createChatModel(credentials, model),
        system: systemPrompt(sources),
        messages: toModelMessages(chat),
        providerOptions: reasoningEffortOptions(credentials, model, "low"),
        abortSignal: controller.signal,
        maxRetries: 1,
      });
      // `fullStream` rather than `textStream`: the text stream ends quietly on
      // a provider error, and a quiet end would be stored as an empty answer.
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          text += part.text;
          emit({ type: "delta", chatId: chat.id, text: part.text });
        } else if (part.type === "error") {
          throw part.error;
        }
      }
      if (!text.trim() && !controller.signal.aborted) {
        failure = { code: "failed", message: "The model returned an empty answer. Try again." };
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        failure = { code: "failed", message: explainFor(error, credentials, model) };
      }
    } finally {
      running.delete(chat.id);
    }

    // Whatever arrived is kept, including the part of an answer that was
    // stopped or cut off: it was on screen, and vanishing it would be worse.
    let stored = chat;
    try {
      if (text.trim()) stored = store.appendMessage(chat.id, "assistant", text, sources);
    } catch {
      // The chat was deleted while it was being answered. Nothing to keep.
    }
    emit(
      failure
        ? { type: "failed", chatId: chat.id, failure, chat: stored }
        : { type: "done", chatId: chat.id, chat: stored },
    );
  })();

  return { chat, streaming: true, failure: null };
}

export function send(
  chatId: string | null,
  text: string,
  documentIds: string[],
  emit: Emit,
): SendResult {
  if (chatId && running.has(chatId)) throw new Error("Wait for the current answer to finish.");
  // The message is stored before anything can fail, so a question asked with
  // no model set up is still there once one is.
  const chat = chatId
    ? store.appendMessage(chatId, "user", text)
    : store.createChat(text, documentIds);
  return answer(chat, emit);
}

export function retry(chatId: string, emit: Emit): SendResult {
  if (running.has(chatId)) throw new Error("Wait for the current answer to finish.");
  const chat = store.getChat(chatId);
  if (!chat) throw new Error("That chat no longer exists.");
  if (chat.messages.at(-1)?.role !== "user") throw new Error("There is nothing to answer.");
  return answer(chat, emit);
}

export function cancel(chatId: string): void {
  running.get(chatId)?.abort();
}

/** Stops every answer in flight, when the window that was reading them goes. */
export function cancelAll(): void {
  for (const controller of running.values()) controller.abort();
}
