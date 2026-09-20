/**
 * Chunking and search for local documents, in plain TypeScript.
 *
 * The server ranks with embeddings. Local mode deliberately does not: Anthropic
 * and xAI serve no embedding model, a local embedding model is one more
 * download, and an API embedding call would send every document to a provider
 * before a question had even been asked. BM25 needs none of that. It works
 * offline, with every model choice, and on the question people actually ask of
 * a document ("what does it say about termination?") matching the words is
 * most of the job.
 *
 * No Electron and no I/O in here, so it can be read, and tested, on its own.
 */
import type { Section } from "@onirix/ingestion/extract";

export type DocumentChunk = {
  index: number;
  text: string;
  /** "Page 3", a sheet name. Null where the format has no such thing. */
  location: string | null;
};

const CHUNK_CHARS = 1000;
/** Carried from the end of one chunk into the next, so a sentence cut by the
 *  boundary is whole in at least one of them. */
const OVERLAP_CHARS = 150;

/** `#page=3` becomes "Page 3": the extractor speaks in anchors, people do not. */
function locationOf(link: string | undefined): string | null {
  if (!link) return null;
  const page = link.match(/^#page=(\d+)$/);
  if (page) return `Page ${page[1]}`;
  const sheet = link.match(/^#sheet=(.+)$/);
  if (sheet?.[1]) return `Sheet ${decodeURIComponent(sheet[1])}`;
  return null;
}

/**
 * Pieces no longer than a chunk, cut at the most natural boundary available:
 * paragraphs first, then lines, then sentences, and only then mid-text.
 */
function pieces(text: string): string[] {
  const out: string[] = [];
  const split = (part: string, separators: RegExp[]): void => {
    if (part.length <= CHUNK_CHARS) {
      if (part.trim()) out.push(part.trim());
      return;
    }
    const [separator, ...rest] = separators;
    if (!separator) {
      for (let at = 0; at < part.length; at += CHUNK_CHARS) {
        out.push(part.slice(at, at + CHUNK_CHARS));
      }
      return;
    }
    for (const smaller of part.split(separator)) split(smaller, rest);
  };
  split(text, [/\n\s*\n/, /\n/, /(?<=[.!?])\s+/]);
  return out;
}

/** The last stretch of a chunk, starting on a word. */
function tail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return "";
  const cut = text.slice(-OVERLAP_CHARS);
  const space = cut.indexOf(" ");
  return space >= 0 ? cut.slice(space + 1) : cut;
}

export function chunkSections(sections: Section[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const location = locationOf(section.link);
    let current = "";
    let first = true;

    const flush = () => {
      if (!current.trim()) return;
      // A table cut into chunks loses its header row after the first one, and
      // a grid of bare numbers answers nothing. The extractor supplies the
      // header for exactly this.
      const text = !first && section.header ? `${section.header}\n${current}` : current;
      chunks.push({ index: chunks.length, text: text.trim(), location });
      first = false;
    };

    for (const piece of pieces(section.text)) {
      if (current && current.length + piece.length + 2 > CHUNK_CHARS) {
        flush();
        // Tables are rows, not prose: half a row repeated helps nobody.
        current = section.header ? "" : tail(current);
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
    flush();
  }
  return chunks;
}

/** Letters and digits of any script, lowercased. One-character tokens are noise. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1);
}

export type SearchableChunk = {
  documentId: string;
  chunk: DocumentChunk;
  tokens: string[];
};

const K1 = 1.2;
const B = 0.75;

/**
 * Okapi BM25 over the chunks of the documents attached to one session.
 *
 * Inverse document frequency is computed over those chunks alone, not the
 * whole library, so a word is "rare" relative to what this session can see.
 * Returns the best `limit` chunks that match at all, best first.
 */
export function search(corpus: SearchableChunk[], query: string, limit: number): SearchableChunk[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0 || corpus.length === 0) return [];

  const averageLength =
    corpus.reduce((total, entry) => total + entry.tokens.length, 0) / corpus.length || 1;

  const containing = new Map<string, number>();
  for (const term of terms) {
    containing.set(term, corpus.filter((entry) => entry.tokens.includes(term)).length);
  }

  const scored = corpus.map((entry) => {
    let score = 0;
    for (const term of terms) {
      const n = containing.get(term) ?? 0;
      if (n === 0) continue;
      let frequency = 0;
      for (const token of entry.tokens) if (token === term) frequency += 1;
      if (frequency === 0) continue;
      const idf = Math.log(1 + (corpus.length - n + 0.5) / (n + 0.5));
      const length = entry.tokens.length / averageLength;
      score += (idf * (frequency * (K1 + 1))) / (frequency + K1 * (1 - B + B * length));
    }
    return { entry, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.entry);
}
