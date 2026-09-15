/**
 * OpenSearch index mapping for document chunks.
 *
 * Ported from Onyx's `backend/onyx/document_index/opensearch/schema.py`.
 * Field names match theirs exactly so the two indices stay interchangeable.
 */
import { createHash } from "node:crypto";

import {
  DEFAULT_MAX_CHUNK_SIZE,
  EF_CONSTRUCTION,
  EF_SEARCH,
  M,
  OPENSEARCH_KNN_ENGINE,
  OPENSEARCH_TEXT_ANALYZER,
} from "./constants";

export const FIELD = {
  title: "title",
  titleVector: "title_vector",
  content: "content",
  contentVector: "content_vector",
  sourceType: "source_type",
  metadataList: "metadata_list",
  lastUpdated: "last_updated",
  createdAt: "created_at",
  public: "public",
  accessControlList: "access_control_list",
  hidden: "hidden",
  globalBoost: "global_boost",
  semanticIdentifier: "semantic_identifier",
  imageFileId: "image_file_id",
  sourceLinks: "source_links",
  documentSets: "document_sets",
  documentId: "document_id",
  chunkIndex: "chunk_index",
  maxChunkSize: "max_chunk_size",
  blurb: "blurb",
  docSummary: "doc_summary",
  chunkContext: "chunk_context",
  metadataSuffix: "metadata_suffix",
  primaryOwners: "primary_owners",
  secondaryOwners: "secondary_owners",
  organizationId: "organization_id",
} as const;

/**
 * OpenSearch document IDs are capped at 512 bytes; leave room for our suffix.
 */
const MAX_DOCUMENT_ID_ENCODED_LENGTH = 512;

/** Fields kept only to render results — never searched, never sorted on. */
const displayOnlyKeyword = {
  type: "keyword",
  index: false,
  doc_values: false,
  store: false,
} as const;

function knnVector(dimension: number) {
  return {
    type: "knn_vector",
    dimension,
    method: {
      name: "hnsw",
      space_type: "cosinesimil",
      engine: OPENSEARCH_KNN_ENGINE,
      parameters: { ef_construction: EF_CONSTRUCTION, m: M },
    },
  };
}

/**
 * Builds the stable OpenSearch `_id` for one chunk.
 *
 * Document IDs come from external sources and can be arbitrarily long, so an
 * over-long ID is replaced by a hash of itself. The chunk size is part of the
 * ID because the same document may be indexed at several chunk sizes.
 */
export function getChunkId(
  documentId: string,
  chunkIndex: number,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE,
): string {
  const suffix = `__${maxChunkSize}__${chunkIndex}`;
  const budget = MAX_DOCUMENT_ID_ENCODED_LENGTH - Buffer.byteLength(suffix, "utf8");

  let id = documentId.replace(/[^\w.\-~]/g, "_");
  if (Buffer.byteLength(id, "utf8") >= budget) {
    // blake2b with a digest sized to the remaining budget. Hex doubles the
    // byte count, so halve it; blake2b caps at 64 bytes.
    const digestSize = Math.min(Math.floor((budget - 1) / 2), 64);
    id = createHash("blake2b512").update(documentId, "utf8").digest("hex").slice(0, digestSize * 2);
  }
  return `${id}${suffix}`;
}

/**
 * Field mapping for the chunk index.
 *
 * `dynamic: "strict"` makes OpenSearch reject documents carrying unexpected
 * fields rather than silently inventing mappings for them.
 */
export function getDocumentSchema(vectorDimension: number) {
  return {
    dynamic: "strict",
    properties: {
      [FIELD.title]: {
        type: "text",
        analyzer: OPENSEARCH_TEXT_ANALYZER,
        fields: { keyword: { type: "keyword", ignore_above: 256 } },
        // Offsets make highlighting cheaper, at the cost of disk.
        index_options: "offsets",
      },
      [FIELD.content]: {
        type: "text",
        store: true,
        analyzer: OPENSEARCH_TEXT_ANALYZER,
        index_options: "offsets",
      },
      [FIELD.titleVector]: knnVector(vectorDimension),
      [FIELD.contentVector]: knnVector(vectorDimension),

      [FIELD.sourceType]: { type: "keyword" },
      [FIELD.metadataList]: { type: "keyword" },
      // `date` defaults to doc_values: false, which would block sorting by date.
      [FIELD.lastUpdated]: { type: "date", format: "epoch_second", doc_values: true },
      [FIELD.createdAt]: { type: "date", format: "epoch_second", doc_values: true },

      // Access control. `public` is split out from the ACL because it is such a
      // broad, critical filter. When `public` is true the ACL has no effect.
      [FIELD.public]: { type: "boolean" },
      [FIELD.accessControlList]: { type: "keyword" },
      // Overrides both of the above; hidden chunks never surface in search.
      [FIELD.hidden]: { type: "boolean" },

      [FIELD.globalBoost]: { type: "integer" },

      [FIELD.semanticIdentifier]: displayOnlyKeyword,
      [FIELD.imageFileId]: displayOnlyKeyword,
      [FIELD.sourceLinks]: displayOnlyKeyword,
      [FIELD.blurb]: displayOnlyKeyword,
      // These three exist only to undo the augmentations applied to `content`.
      [FIELD.docSummary]: displayOnlyKeyword,
      [FIELD.chunkContext]: displayOnlyKeyword,
      [FIELD.metadataSuffix]: displayOnlyKeyword,

      [FIELD.documentSets]: { type: "keyword" },
      [FIELD.primaryOwners]: { type: "keyword" },
      [FIELD.secondaryOwners]: { type: "keyword" },

      [FIELD.documentId]: { type: "keyword" },
      [FIELD.chunkIndex]: { type: "integer" },
      [FIELD.maxChunkSize]: { type: "integer" },

      // Onirix is organization-scoped throughout; every chunk carries its owner.
      [FIELD.organizationId]: { type: "keyword" },
    },
  };
}

/** Single-node settings. `knn: true` is required for vector search to work. */
export function getIndexSettings() {
  return {
    index: {
      number_of_shards: 1,
      number_of_replicas: 0,
      knn: true,
      "knn.algo_param.ef_search": EF_SEARCH,
    },
  };
}

/** A chunk as stored in the index, minus the vectors. */
export type DocumentChunkFields = {
  document_id: string;
  chunk_index: number;
  max_chunk_size: number;
  organization_id: string;
  title: string | null;
  content: string;
  source_type: string;
  metadata_list: string[] | null;
  last_updated: number | null;
  created_at: number | null;
  public: boolean;
  access_control_list: string[];
  hidden: boolean;
  global_boost: number;
  semantic_identifier: string;
  image_file_id: string | null;
  source_links: string | null;
  blurb: string;
  doc_summary: string;
  chunk_context: string;
  metadata_suffix: string | null;
  document_sets: string[] | null;
  primary_owners: string[] | null;
  secondary_owners: string[] | null;
};

export type DocumentChunk = DocumentChunkFields & {
  title_vector: number[] | null;
  content_vector: number[];
};
