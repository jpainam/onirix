/**
 * The indexing pipeline: bytes in, searchable chunks out.
 *
 * Extract -> chunk -> embed -> write to OpenSearch. Runs in the background
 * worker; the web app only enqueues work.
 */
import { embedMany } from "ai";

import { createEmbeddingModel, type ProviderCredentials } from "@onirix/llm";
import {
  DEFAULT_MAX_CHUNK_SIZE,
  type DocumentChunk,
  type DocumentIndex,
} from "@onirix/search";

import { chunkDocument } from "./chunker";
import { extractSections } from "./extract";

/**
 * Embedding requests are batched. Providers cap both array length and total
 * tokens per call, so this stays well below the usual limits.
 */
const EMBED_BATCH_SIZE = 96;

export type IndexDocumentInput = {
  organizationId: string;
  documentId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  mimeType: string;
  fileName: string;
  buffer: Buffer;
  /** Everyone in the organization may read this document. */
  isPublic: boolean;
  /** Consulted only when `isPublic` is false. */
  accessControlList: string[];
  collectionIds?: string[];
  primaryOwners?: string[];
  sourceUpdatedAt: Date | null;
  metadata?: Record<string, string | string[]>;
};

export type IndexDocumentResult = {
  chunkCount: number;
};

export async function indexDocument(
  input: IndexDocumentInput,
  deps: {
    index: DocumentIndex;
    embeddingCredentials: ProviderCredentials;
    embeddingModelId: string;
  },
): Promise<IndexDocumentResult> {
  const sections = await extractSections(input.buffer, input.mimeType, input.fileName);

  const chunks = chunkDocument({
    title: input.title,
    sections,
    metadata: input.metadata,
  });

  if (chunks.length === 0) {
    // An empty or image-only file. Not an error, but nothing to index either.
    return { chunkCount: 0 };
  }

  const embeddingModel = createEmbeddingModel(deps.embeddingCredentials, deps.embeddingModelId);

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch.map((chunk) => chunk.content),
    });
    vectors.push(...embeddings);
  }

  // One vector per chunk. A mismatch means the provider dropped inputs, which
  // would otherwise surface as a chunk indexed with an undefined vector.
  if (vectors.length !== chunks.length) {
    throw new Error(
      `Embedding count (${vectors.length}) does not match chunk count (${chunks.length}).`,
    );
  }

  const lastUpdated = input.sourceUpdatedAt
    ? Math.floor(input.sourceUpdatedAt.getTime() / 1000)
    : null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const documents: DocumentChunk[] = chunks.map((chunk, i) => ({
    document_id: input.documentId,
    chunk_index: chunk.chunkIndex,
    max_chunk_size: DEFAULT_MAX_CHUNK_SIZE,
    organization_id: input.organizationId,

    title: input.title,
    content: chunk.content,
    // Title is already folded into chunk content, so a separate title vector
    // would double-count it. See the sub-query notes in packages/search/query.
    title_vector: null,
    content_vector: vectors[i]!,

    source_type: input.sourceType,
    metadata_list: toMetadataList(input.metadata),
    last_updated: lastUpdated,
    created_at: nowSeconds,

    public: input.isPublic,
    access_control_list: input.accessControlList,
    hidden: false,
    global_boost: 0,

    semantic_identifier: input.title,
    image_file_id: null,
    source_links: JSON.stringify(chunk.sourceLinks),
    blurb: chunk.blurb,
    doc_summary: "",
    chunk_context: "",
    metadata_suffix: chunk.metadataSuffix || null,

    document_sets: input.collectionIds ?? null,
    primary_owners: input.primaryOwners ?? null,
    secondary_owners: null,
  }));

  // Clear the previous version first. Chunk IDs are deterministic, so a
  // re-index overwrites matching chunks -- but a document that got shorter
  // would leave orphaned chunks behind at the old high indices.
  await deps.index.deleteDocument(input.organizationId, input.documentId);
  await deps.index.indexChunks(documents);

  return { chunkCount: documents.length };
}

function toMetadataList(
  metadata: Record<string, string | string[]> | undefined,
): string[] | null {
  if (!metadata) return null;
  const entries = Object.entries(metadata).flatMap(([key, value]) =>
    (Array.isArray(value) ? value : [value]).map((v) => `${key}==${v}`),
  );
  return entries.length > 0 ? entries : null;
}
