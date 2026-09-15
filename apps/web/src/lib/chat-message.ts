/**
 * The wire shape of a chat turn.
 *
 * Retrieval happens on the server, but PRODUCT.md requires a reader to inspect
 * the passage behind every `[1]`, so the sources travel to the client as a
 * typed data part alongside the answer text rather than being thrown away.
 */
import type { UIMessage } from "ai";

export type CitedSource = {
  /** 1-based number the model writes inline, e.g. 1 for `[1]`. */
  index: number;
  documentId: string;
  title: string;
  sourceType: string;
  /** ISO date (YYYY-MM-DD) of the document's last update, when known. */
  updatedAt: string | null;
  /** The retrieved chunk — what the answer was actually grounded in. */
  passage: string;
  /** Link to the document in its originating system, when it has one. */
  url: string | null;
};

export type ChatDataParts = {
  sources: CitedSource[];
};

export type OnirixUIMessage = UIMessage<unknown, ChatDataParts>;

/**
 * The inline marker the model writes, e.g. `[1]`.
 *
 * Bounded to three digits so a year or an identifier in the prose never reads
 * as a citation. Always used with `matchAll`, which works on a copy and so
 * keeps no state on this shared pattern.
 */
export const CITATION_MARKER = /\[(\d{1,3})\]/g;

export function getMessageText(message: OnirixUIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Everything retrieved for a turn, cited or not. */
function getRetrievedSources(message: OnirixUIMessage): CitedSource[] {
  for (const part of message.parts) {
    if (part.type === "data-sources") return part.data;
  }
  return [];
}

/**
 * The sources an answer actually leaned on, in citation order.
 *
 * Retrieval sends over more context than the model uses, and listing all of it
 * would misstate the basis of the answer.
 */
export function getCitedSources(message: OnirixUIMessage): CitedSource[] {
  const retrieved = getRetrievedSources(message);
  if (retrieved.length === 0) return [];

  const byIndex = new Map(retrieved.map((source) => [source.index, source]));
  const cited = new Set<number>();

  for (const match of getMessageText(message).matchAll(CITATION_MARKER)) {
    const value = match[1];
    if (value) cited.add(Number.parseInt(value, 10));
  }

  return [...cited]
    .sort((a, b) => a - b)
    .map((index) => byIndex.get(index))
    .filter((source): source is CitedSource => source !== undefined);
}

