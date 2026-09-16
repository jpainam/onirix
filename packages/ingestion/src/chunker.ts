/**
 * Document chunking.
 *
 * Ported from Onyx's `backend/onyx/indexing/chunker.py`. The approach is
 * section-aware accumulation: sections are packed into a chunk until the token
 * budget is reached, and only oversized sections are split internally. This
 * keeps semantically related text together rather than cutting at a fixed
 * stride.
 */
import { encode } from "gpt-tokenizer";

import { DEFAULT_MAX_CHUNK_SIZE } from "@onirix/search";

import type { Section } from "./extract";

/**
 * No overlap between chunks. Onyx found overlap's benefit to retrieval quality
 * unclear, and it makes reassembling adjacent chunks messy.
 */
export const CHUNK_OVERLAP = 0;

/** Title and metadata must not crowd out the chunk's actual content. */
export const MAX_METADATA_PERCENTAGE = 0.25;

/** Below this many tokens of real content, drop the prefix/suffix instead. */
export const CHUNK_MIN_CONTENT = 256;

/** Tokens of chunk text kept as the preview blurb shown in results. */
export const BLURB_SIZE = 128;

const SECTION_SEPARATOR = "\n\n";

export type Chunk = {
  chunkIndex: number;
  /** Text as embedded and indexed, including title prefix and metadata suffix. */
  content: string;
  /** Short preview for result lists. */
  blurb: string;
  /** Maps a character offset in `content` to a link in the source document. */
  sourceLinks: Record<number, string>;
  metadataSuffix: string;
  titlePrefix: string;
};

function countTokens(text: string): number {
  return encode(text).length;
}

/** Truncates to a token budget, cutting on a token boundary. */
function truncateToTokens(text: string, maxTokens: number): string {
  const tokens = encode(text);
  if (tokens.length <= maxTokens) return text;
  // Re-slice on characters proportionally, then trim to a word boundary; exact
  // decode round-tripping is not needed for a preview string.
  const ratio = maxTokens / tokens.length;
  const cut = text.slice(0, Math.floor(text.length * ratio));
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length);
}

/**
 * Renders document metadata as a natural-language suffix appended to chunk
 * content, so metadata is searchable alongside the text.
 */
export function buildMetadataSuffix(metadata: Record<string, string | string[]>): string {
  const entries = Object.entries(metadata).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  if (entries.length === 0) return "";

  const rendered = entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("; ");
  return `Metadata: ${rendered}`;
}

export type ChunkOptions = {
  title: string;
  sections: Section[];
  metadata?: Record<string, string | string[]>;
  chunkTokenLimit?: number;
};

export function chunkDocument(options: ChunkOptions): Chunk[] {
  const chunkTokenLimit = options.chunkTokenLimit ?? DEFAULT_MAX_CHUNK_SIZE;
  const title = options.title.trim();

  let titlePrefix = title ? `${title}\n` : "";
  let metadataSuffix = buildMetadataSuffix(options.metadata ?? {});

  const titleTokens = countTokens(titlePrefix);
  const metadataTokens = countTokens(metadataSuffix);

  // Cap how much of the budget the title and metadata may consume.
  const metadataBudget = Math.floor(chunkTokenLimit * MAX_METADATA_PERCENTAGE);
  if (titleTokens + metadataTokens > metadataBudget) {
    metadataSuffix = "";
  }

  let contentTokenLimit = chunkTokenLimit - countTokens(titlePrefix) - countTokens(metadataSuffix);

  // If the prefix/suffix leave too little room for actual content, drop them
  // and index the raw chunk instead.
  if (contentTokenLimit <= CHUNK_MIN_CONTENT) {
    contentTokenLimit = chunkTokenLimit;
    titlePrefix = "";
    metadataSuffix = "";
  }

  const payloads = accumulateSections(options.sections, contentTokenLimit);

  return payloads.map((payload, chunkIndex) => {
    const content = [titlePrefix + payload.text, metadataSuffix]
      .filter(Boolean)
      .join(SECTION_SEPARATOR);

    return {
      chunkIndex,
      content,
      blurb: truncateToTokens(payload.text, BLURB_SIZE),
      sourceLinks: payload.linkOffsets,
      metadataSuffix,
      titlePrefix,
    };
  });
}

type Payload = { text: string; linkOffsets: Record<number, string> };

/**
 * Packs sections into chunks up to `contentTokenLimit`.
 *
 * A section that fits extends the current chunk; one that does not flushes it
 * first. A section larger than a whole chunk is split on sentence boundaries.
 */
function accumulateSections(sections: Section[], contentTokenLimit: number): Payload[] {
  const chunks: Payload[] = [];
  let current: Payload = { text: "", linkOffsets: {} };

  const flush = () => {
    if (current.text.trim()) chunks.push(current);
    current = { text: "", linkOffsets: {} };
  };

  for (const section of sections) {
    const text = section.text.trim();
    if (!text) continue;
    const link = section.link ?? "";

    if (countTokens(text) > contentTokenLimit) {
      // Oversized: flush what we have, then split the section itself.
      flush();
      const pieces = section.header
        ? splitTable(text, section.header, contentTokenLimit)
        : splitOversized(text, contentTokenLimit);
      for (const piece of pieces) {
        chunks.push({ text: piece, linkOffsets: link ? { 0: link } : {} });
      }
      continue;
    }

    const combined = current.text ? `${current.text}${SECTION_SEPARATOR}${text}` : text;
    if (countTokens(combined) > contentTokenLimit) {
      flush();
      current = { text, linkOffsets: link ? { 0: link } : {} };
    } else {
      const offset = current.text ? current.text.length + SECTION_SEPARATOR.length : 0;
      current = {
        text: combined,
        linkOffsets: link ? { ...current.linkOffsets, [offset]: link } : current.linkOffsets,
      };
    }
  }

  flush();
  return chunks;
}

/**
 * Splits a table, repeating its header at the top of every piece.
 *
 * Rows, not sentences, are the unit: a spreadsheet row split down the middle
 * produces two half-records, and sentence boundaries do not exist in a grid of
 * numbers anyway. The header is charged against the budget of each piece rather
 * than added on top, so a chunk still fits the embedding window.
 */
function splitTable(text: string, header: string, contentTokenLimit: number): string[] {
  const headerTokens = countTokens(`${header}\n`);
  const bodyLimit = contentTokenLimit - headerTokens;

  // A very wide table can have a header longer than the rows it labels. Past
  // half the budget, repeating it costs more chunks than the labels are worth,
  // so the table is split the generic way instead.
  if (bodyLimit < contentTokenLimit / 2) {
    return splitOversized(text, contentTokenLimit);
  }

  // The header is prepended to every piece, so the copy at the top of the
  // source text would otherwise be duplicated in the first one.
  const rows = text.split("\n");
  const body = text.startsWith(header) ? rows.slice(header.split("\n").length) : rows;

  const pieces: string[] = [];
  let buffer: string[] = [];
  let tokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    pieces.push(`${header}\n${buffer.join("\n")}`);
    buffer = [];
    tokens = 0;
  };

  for (const row of body) {
    const rowTokens = countTokens(`${row}\n`);

    // A single row over the whole budget is pathological — a cell holding an
    // essay. Cut it the generic way rather than letting it blow the chunk.
    if (rowTokens > bodyLimit) {
      flush();
      for (const piece of hardSplit(row, bodyLimit)) {
        pieces.push(`${header}\n${piece}`);
      }
      continue;
    }

    if (tokens + rowTokens > bodyLimit) flush();
    buffer.push(row);
    tokens += rowTokens;
  }

  flush();
  return pieces;
}

/**
 * Splits text too large for one chunk, preferring sentence boundaries so a
 * chunk does not begin or end mid-thought.
 */
function splitOversized(text: string, contentTokenLimit: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [text];
  const pieces: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    const candidate = buffer + sentence;

    if (countTokens(candidate) > contentTokenLimit) {
      if (buffer) {
        pieces.push(buffer.trim());
        buffer = "";
      }
      // A single sentence over the limit still has to be cut somewhere.
      if (countTokens(sentence) > contentTokenLimit) {
        pieces.push(...hardSplit(sentence, contentTokenLimit));
        continue;
      }
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim()) pieces.push(buffer.trim());
  return pieces;
}

/** Last resort: split on whitespace to fit the token budget. */
function hardSplit(text: string, contentTokenLimit: number): string[] {
  const words = text.split(/\s+/);
  const pieces: string[] = [];
  let buffer = "";

  for (const word of words) {
    const candidate = buffer ? `${buffer} ${word}` : word;
    if (countTokens(candidate) > contentTokenLimit) {
      if (buffer) pieces.push(buffer);
      buffer = word;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces;
}
