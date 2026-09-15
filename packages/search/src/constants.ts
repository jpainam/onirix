/**
 * Tuning constants for the OpenSearch document index.
 *
 * Ported from Onyx's `backend/onyx/document_index/opensearch/constants.py`.
 * Values are kept identical so their retrieval-quality work carries over; the
 * comments explain *why* each number was chosen rather than restating it.
 */

/** Maximum tokens a chunk's content may hold. Matches Onyx's embedding context size. */
export const DEFAULT_MAX_CHUNK_SIZE = 512;

/** OpenSearch refuses to return more than this many hits from one search. */
export const DEFAULT_OPENSEARCH_MAX_RESULT_WINDOW = 10_000;

/** Assumed age of documents with no `last_updated`, for time-cutoff filtering. */
export const ASSUMED_DOCUMENT_AGE_DAYS = 90;

/**
 * HNSW graph construction parameters.
 *
 * `EF_CONSTRUCTION` is the dynamic candidate list size during graph build —
 * higher means better recall but slower indexing. `M` is the number of
 * bi-directional links per node — higher means better recall but more memory.
 */
export const EF_CONSTRUCTION = 256;
export const M = 32;

/**
 * Candidates each hybrid sub-query pulls before fusion.
 *
 * Hybrid scoring reorders results, so the candidate pool must be much larger
 * than the final result count. If keyword and vector each returned only the
 * final N, they would need near-perfect overlap to rank well; a wide pool gives
 * the fusion step enough to work with. Onyx landed on 500 after finding 100 hurt
 * recall.
 */
export const DEFAULT_NUM_HYBRID_SUBQUERY_CANDIDATES = 500;

/** Vectors examined when selecting top-k neighbours. Larger of this and `k` wins. */
export const EF_SEARCH = DEFAULT_NUM_HYBRID_SUBQUERY_CANDIDATES;

/** Lucene beat both Faiss (no benefit) and NMSLIB (deprecated) in Onyx's testing. */
export const OPENSEARCH_KNN_ENGINE = "lucene";

export const DEFAULT_OPENSEARCH_QUERY_TIMEOUT_S = 50;

/**
 * Relative weight of each hybrid sub-query, in sub-query order. Must sum to 1.
 *
 * Onyx's default configuration: one content-vector query and one combined
 * title+content keyword query, weighted evenly.
 */
export const HYBRID_CONTENT_VECTOR_WEIGHT = 0.5;
export const HYBRID_KEYWORD_WEIGHT = 0.5;

/** Text analyzer applied to `title` and `content`. Changing this needs a reindex. */
export const OPENSEARCH_TEXT_ANALYZER = "english";
