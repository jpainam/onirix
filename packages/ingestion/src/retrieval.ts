/**
 * Retrieval for answering: embed the query, search, rerank, and shape the
 * result into prompt context plus citation records.
 */
import { embed } from "ai";

import { createEmbeddingModel, type ProviderCredentials, type RetrievedContext } from "@onirix/llm";
import {
  dedupeByDocument,
  rerank,
  type DocumentIndex,
  type SearchFilters,
  type SearchHit,
} from "@onirix/search";

/**
 * Chunks pulled from the index before reranking. Wider than the final count so
 * recency and boost adjustments have room to reorder meaningfully.
 */
const RETRIEVAL_CANDIDATES = 30;

/** Chunks passed to the model. Bounded to keep the prompt affordable. */
export const DEFAULT_CONTEXT_CHUNKS = 8;

/**
 * How many of the context slots a conversation's attached documents may take.
 * Half, so that pointing a conversation at a file still leaves room for the
 * rest of the workspace to answer what that file does not cover.
 */
const ATTACHED_SHARE = 0.5;

export type RetrievalResult = {
  hits: SearchHit[];
  context: RetrievedContext[];
};

const chunkKey = (hit: SearchHit) => `${hit.document_id}:${hit.chunk_index}`;

export async function retrieveContext(options: {
  queryText: string;
  filters: SearchFilters;
  limit?: number;
  index: DocumentIndex;
  embeddingCredentials: ProviderCredentials;
  embeddingModelId: string;
  /**
   * Documents the conversation was pointed at. They are searched on their own,
   * under the same filters as everything else, and their passages go first. An
   * id the caller cannot see matches nothing, so this can only narrow.
   */
  attachedDocumentIds?: string[];
}): Promise<RetrievalResult> {
  const limit = options.limit ?? DEFAULT_CONTEXT_CHUNKS;

  const { embedding } = await embed({
    model: createEmbeddingModel(options.embeddingCredentials, options.embeddingModelId),
    value: options.queryText,
  });

  const attachedIds = options.attachedDocumentIds ?? [];
  const [raw, rawAttached] = await Promise.all([
    options.index.hybridSearch({
      queryText: options.queryText,
      queryVector: embedding,
      numHits: RETRIEVAL_CANDIDATES,
      filters: options.filters,
    }),
    attachedIds.length > 0
      ? options.index.hybridSearch({
          queryText: options.queryText,
          queryVector: embedding,
          numHits: RETRIEVAL_CANDIDATES,
          filters: { ...options.filters, documentIds: attachedIds },
        })
      : [],
  ]);

  // Attached documents are not collapsed to one passage each: someone who
  // attaches a single long file wants it read in depth, not sampled once.
  const attached = rerank(rawAttached).slice(0, Math.ceil(limit * ATTACHED_SHARE));
  const taken = new Set(attached.map(chunkKey));

  // One document should not occupy every citation slot, so collapse to the
  // best chunk per document before truncating.
  const general = dedupeByDocument(rerank(raw)).filter(
    (hit) => !taken.has(chunkKey(hit)),
  );
  const hits = [...attached, ...general].slice(0, limit);

  const context: RetrievedContext[] = hits.map((hit, i) => ({
    document: i + 1,
    title: hit.title ?? hit.semantic_identifier,
    sourceType: hit.source_type,
    updatedAt: hit.last_updated
      ? new Date(hit.last_updated * 1000).toISOString().slice(0, 10)
      : null,
    content: hit.content,
  }));

  return { hits, context };
}

/**
 * Extracts the citation numbers the model actually used.
 *
 * Retrieval returns more context than gets cited, and storing uncited sources
 * as citations would misrepresent the answer's basis.
 */
export function extractCitedIndices(answerText: string): number[] {
  const matches = answerText.matchAll(/\[(\d+)\]/g);
  const cited = new Set<number>();
  for (const match of matches) {
    // Group 1 always participates in a match for this pattern.
    const value = match[1];
    if (value) cited.add(Number.parseInt(value, 10));
  }
  return [...cited].sort((a, b) => a - b);
}
