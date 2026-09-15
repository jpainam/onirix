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

export type RetrievalResult = {
  hits: SearchHit[];
  context: RetrievedContext[];
};

export async function retrieveContext(options: {
  queryText: string;
  filters: SearchFilters;
  limit?: number;
  index: DocumentIndex;
  embeddingCredentials: ProviderCredentials;
  embeddingModelId: string;
}): Promise<RetrievalResult> {
  const limit = options.limit ?? DEFAULT_CONTEXT_CHUNKS;

  const { embedding } = await embed({
    model: createEmbeddingModel(options.embeddingCredentials, options.embeddingModelId),
    value: options.queryText,
  });

  const raw = await options.index.hybridSearch({
    queryText: options.queryText,
    queryVector: embedding,
    numHits: RETRIEVAL_CANDIDATES,
    filters: options.filters,
  });

  // One document should not occupy every citation slot, so collapse to the
  // best chunk per document before truncating.
  const hits = dedupeByDocument(rerank(raw)).slice(0, limit);

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
