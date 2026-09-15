/**
 * Hybrid search query construction.
 *
 * Ported from Onyx's `backend/onyx/document_index/opensearch/search.py`.
 *
 * A hybrid query runs its sub-queries independently — they never interact — and
 * a normalization processor fuses the scores afterwards. A document matched by
 * only one sub-query scores 0 on the other, which acts as minimum-value
 * clipping rather than a true score.
 *
 * Note this means boosts cannot be applied inside the query. Embedding scores
 * are not uniformly distributed (they cluster around 0.6-0.8, varying by model
 * and query), so scaling them pre-normalization would push a strong match below
 * a weak one. Recency and boost adjustments are therefore applied in
 * `rerank.ts`, after OpenSearch has done the initial filtering.
 */
import {
  DEFAULT_NUM_HYBRID_SUBQUERY_CANDIDATES,
  DEFAULT_OPENSEARCH_MAX_RESULT_WINDOW,
  DEFAULT_OPENSEARCH_QUERY_TIMEOUT_S,
  HYBRID_CONTENT_VECTOR_WEIGHT,
  HYBRID_KEYWORD_WEIGHT,
} from "./constants";
import { FIELD } from "./schema";

export const NORMALIZATION_PIPELINE_NAME = "onirix_normalization_min_max";

/**
 * Min-max fusion pipeline. Weights are positional and must match the sub-query
 * order in `buildHybridQuery` exactly.
 *
 * z-score is theoretically better here (less outlier-sensitive, handles
 * distribution drift), but Onyx measured no meaningful difference below ~10K
 * docs, so min-max stays the default.
 */
export function getNormalizationPipelineConfig() {
  return {
    description: "Min-max normalization for Onirix hybrid search",
    phase_results_processors: [
      {
        "normalization-processor": {
          normalization: { technique: "min_max" },
          combination: {
            technique: "arithmetic_mean",
            parameters: {
              weights: [HYBRID_CONTENT_VECTOR_WEIGHT, HYBRID_KEYWORD_WEIGHT],
            },
          },
        },
      },
    ],
  };
}

export type SearchFilters = {
  organizationId: string;
  /** ACL entries the user holds. A chunk matches if public, or if its ACL intersects. */
  accessControlList: string[];
  sourceTypes?: string[];
  documentSets?: string[];
  documentIds?: string[];
  includeHidden?: boolean;
};

function buildFilters(filters: SearchFilters): unknown[] {
  const clauses: unknown[] = [
    { term: { [FIELD.organizationId]: filters.organizationId } },
  ];

  if (!filters.includeHidden) {
    clauses.push({ term: { [FIELD.hidden]: false } });
  }

  // Permissions follow the user: a chunk is visible if it is public OR the user
  // holds one of its ACL entries. Never widen this without changing the ACLs
  // written at index time.
  clauses.push({
    bool: {
      should: [
        { term: { [FIELD.public]: true } },
        { terms: { [FIELD.accessControlList]: filters.accessControlList } },
      ],
      minimum_should_match: 1,
    },
  });

  if (filters.sourceTypes?.length) {
    clauses.push({ terms: { [FIELD.sourceType]: filters.sourceTypes } });
  }
  if (filters.documentSets?.length) {
    clauses.push({ terms: { [FIELD.documentSets]: filters.documentSets } });
  }
  if (filters.documentIds?.length) {
    clauses.push({ terms: { [FIELD.documentId]: filters.documentIds } });
  }

  return clauses;
}

/**
 * Builds a hybrid content-vector + keyword query.
 *
 * Title is deliberately folded into the keyword sub-query rather than given its
 * own: titles are already included in chunk content, so a separate title clause
 * behaves as a boost, not an independent scoring component.
 *
 * Must be issued with `search_pipeline=NORMALIZATION_PIPELINE_NAME` — without
 * the fusion step the returned scores are not meaningful.
 */
export function buildHybridQuery(options: {
  queryText: string;
  queryVector: number[];
  numHits: number;
  filters: SearchFilters;
  candidatesPerSubquery?: number;
}) {
  const { queryText, queryVector, numHits, filters } = options;

  if (numHits > DEFAULT_OPENSEARCH_MAX_RESULT_WINDOW) {
    throw new Error(
      `numHits (${numHits}) exceeds the maximum result window (${DEFAULT_OPENSEARCH_MAX_RESULT_WINDOW}).`,
    );
  }

  const candidates = options.candidatesPerSubquery ?? DEFAULT_NUM_HYBRID_SUBQUERY_CANDIDATES;
  const filterClauses = buildFilters(filters);

  return {
    query: {
      hybrid: {
        // Order must match the normalization pipeline weights.
        queries: [
          { knn: { [FIELD.contentVector]: { vector: queryVector, k: candidates } } },
          {
            multi_match: {
              query: queryText,
              // Title weighted up; it is short, so a match there is a strong signal.
              fields: [`${FIELD.content}`, `${FIELD.title}^2`],
              type: "best_fields",
            },
          },
        ],
        // Candidate pool per sub-query per shard, so keyword and vector
        // contribute equally to fusion.
        pagination_depth: candidates,
        // Applied to each sub-query independently, so filtered-out documents
        // do not consume candidate slots.
        filter: { bool: { filter: filterClauses } },
      },
    },
    size: numHits,
    timeout: `${DEFAULT_OPENSEARCH_QUERY_TIMEOUT_S}s`,
    // Vectors are large and unused upstream; excluding them saves transfer cost.
    _source: { excludes: [FIELD.titleVector, FIELD.contentVector] },
    highlight: {
      fields: { [FIELD.content]: {} },
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
      fragment_size: 200,
      number_of_fragments: 2,
    },
  };
}

/** Keyword-only query, for direct search where the user wants documents not answers. */
export function buildKeywordQuery(options: {
  queryText: string;
  numHits: number;
  filters: SearchFilters;
}) {
  return {
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: options.queryText,
              fields: [`${FIELD.content}`, `${FIELD.title}^2`],
              type: "best_fields",
            },
          },
        ],
        filter: buildFilters(options.filters),
      },
    },
    size: options.numHits,
    _source: { excludes: [FIELD.titleVector, FIELD.contentVector] },
  };
}
