/**
 * OpenSearch client and index lifecycle.
 *
 * The index name embeds the embedding model, mirroring Onyx: vector dimension
 * is baked into the mapping, so switching embedding models means building a new
 * index rather than mutating the existing one.
 */
import { Client } from "@opensearch-project/opensearch";

import { DEFAULT_MAX_CHUNK_SIZE } from "./constants";
import {
  NORMALIZATION_PIPELINE_NAME,
  buildHybridQuery,
  buildKeywordQuery,
  getNormalizationPipelineConfig,
  type SearchFilters,
} from "./query";
import {
  FIELD,
  type DocumentChunk,
  type DocumentChunkFields,
  getChunkId,
  getDocumentSchema,
  getIndexSettings,
} from "./schema";

export type SearchConfig = {
  OPENSEARCH_HOST: string;
  OPENSEARCH_REST_API_PORT: number;
  OPENSEARCH_ADMIN_USERNAME: string;
  OPENSEARCH_ADMIN_PASSWORD: string;
  OPENSEARCH_USE_SSL: boolean;
  OPENSEARCH_VERIFY_CERTS: boolean;
};

export function createSearchClient(config: SearchConfig): Client {
  const protocol = config.OPENSEARCH_USE_SSL ? "https" : "http";
  return new Client({
    node: `${protocol}://${config.OPENSEARCH_HOST}:${config.OPENSEARCH_REST_API_PORT}`,
    auth: {
      username: config.OPENSEARCH_ADMIN_USERNAME,
      password: config.OPENSEARCH_ADMIN_PASSWORD,
    },
    // The bundled security plugin serves a self-signed cert. Verification is
    // off for self-hosted defaults; set OPENSEARCH_VERIFY_CERTS with a real CA
    // to turn it on.
    ssl: { rejectUnauthorized: config.OPENSEARCH_VERIFY_CERTS },
  });
}

/** Index name for a given embedding model. Sanitized: OpenSearch rejects `/` and uppercase. */
export function getIndexName(embeddingModel: string): string {
  const slug = embeddingModel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `onirix_chunk_${slug}`;
}

export type SearchHit = DocumentChunkFields & {
  score: number;
  highlights: string[];
};

export class DocumentIndex {
  constructor(
    private readonly client: Client,
    readonly indexName: string,
    private readonly vectorDimension: number,
  ) {}

  /**
   * Creates the index and fusion pipeline if absent. Safe to call on every boot.
   */
  async ensureReady(): Promise<void> {
    const pipelineConfig = getNormalizationPipelineConfig();
    await this.client.transport.request({
      method: "PUT",
      path: `/_search/pipeline/${NORMALIZATION_PIPELINE_NAME}`,
      body: pipelineConfig,
    });

    const exists = await this.client.indices.exists({ index: this.indexName });
    if (exists.body) return;

    try {
      await this.client.indices.create({
        index: this.indexName,
        body: {
          settings: getIndexSettings(),
          mappings: getDocumentSchema(this.vectorDimension) as Record<string, unknown>,
        },
      });
    } catch (error: unknown) {
      // Another worker may have created it in the gap between check and create.
      if (!isAlreadyExistsError(error)) throw error;
    }
  }

  /** Bulk-indexes chunks. Chunk IDs are deterministic, so this is an upsert. */
  async indexChunks(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const operations = chunks.flatMap((chunk) => [
      {
        index: {
          _index: this.indexName,
          _id: getChunkId(chunk.document_id, chunk.chunk_index, chunk.max_chunk_size),
        },
      },
      chunk,
    ]);

    const response = await this.client.bulk({ body: operations, refresh: true });
    if (response.body.errors) {
      const firstError = response.body.items.find(
        (item: Record<string, { error?: unknown }>) => Object.values(item)[0]?.error,
      );
      throw new Error(`Bulk index failed: ${JSON.stringify(firstError)}`);
    }
  }

  /** Removes every chunk belonging to a document. */
  async deleteDocument(organizationId: string, documentId: string): Promise<void> {
    await this.client.deleteByQuery({
      index: this.indexName,
      refresh: true,
      body: {
        query: {
          bool: {
            filter: [
              { term: { [FIELD.organizationId]: organizationId } },
              { term: { [FIELD.documentId]: documentId } },
            ],
          },
        },
      },
    });
  }

  /**
   * Rewrites the access fields on every chunk of a document, in place.
   *
   * Re-running the whole pipeline would re-extract and re-embed a document
   * whose text has not changed, which is slow and costs a provider call per
   * chunk. Permissions are just two fields, so they are updated directly.
   *
   * `refresh: true` matters here in a way it does not for indexing: until the
   * refresh completes the index still answers with the old permissions, and a
   * revoked reader would keep seeing the document.
   */
  async updateDocumentAccess(
    organizationId: string,
    documentId: string,
    access: { isPublic: boolean; accessControlList: string[] },
  ): Promise<void> {
    await this.client.updateByQuery({
      index: this.indexName,
      refresh: true,
      // Conflicts happen when indexing writes the same chunk concurrently; that
      // write already carries the new permissions, so skipping is correct.
      conflicts: "proceed",
      body: {
        query: {
          bool: {
            filter: [
              { term: { [FIELD.organizationId]: organizationId } },
              { term: { [FIELD.documentId]: documentId } },
            ],
          },
        },
        script: {
          source: `ctx._source['${FIELD.public}'] = params.isPublic; ctx._source['${FIELD.accessControlList}'] = params.acl;`,
          lang: "painless",
          params: { isPublic: access.isPublic, acl: access.accessControlList },
        },
      },
    });
  }

  /**
   * Rewrites the collection membership on every chunk of a document, in place.
   *
   * The counterpart to `updateDocumentAccess`, and for the same reason: moving
   * a document between collections leaves its text untouched, so the chunks are
   * patched rather than rebuilt. `refresh: true` keeps a collection-scoped
   * search from answering out of the previous grouping.
   */
  async updateDocumentSets(
    organizationId: string,
    documentId: string,
    documentSets: string[],
  ): Promise<void> {
    await this.client.updateByQuery({
      index: this.indexName,
      refresh: true,
      // A concurrent index write already carries the new membership, so
      // skipping the conflicting chunk is correct.
      conflicts: "proceed",
      body: {
        query: {
          bool: {
            filter: [
              { term: { [FIELD.organizationId]: organizationId } },
              { term: { [FIELD.documentId]: documentId } },
            ],
          },
        },
        script: {
          // Null rather than an empty list when a document belongs to no
          // collection: that is what the indexer writes, and a `terms` filter
          // must not match either form.
          source: `ctx._source['${FIELD.documentSets}'] = params.sets;`,
          lang: "painless",
          params: { sets: documentSets.length > 0 ? documentSets : null },
        },
      },
    });
  }

  async hybridSearch(options: {
    queryText: string;
    queryVector: number[];
    numHits: number;
    filters: SearchFilters;
  }): Promise<SearchHit[]> {
    const body = buildHybridQuery(options);
    const response = await this.client.search({
      index: this.indexName,
      body: body as Record<string, unknown>,
      // Without the fusion pipeline the hybrid scores are meaningless.
      search_pipeline: NORMALIZATION_PIPELINE_NAME,
    });
    return toHits(response);
  }

  async keywordSearch(options: {
    queryText: string;
    numHits: number;
    filters: SearchFilters;
  }): Promise<SearchHit[]> {
    const response = await this.client.search({
      index: this.indexName,
      body: buildKeywordQuery(options) as Record<string, unknown>,
    });
    return toHits(response);
  }

  async countDocuments(organizationId: string): Promise<number> {
    const response = await this.client.count({
      index: this.indexName,
      body: { query: { term: { [FIELD.organizationId]: organizationId } } },
    });
    return response.body.count;
  }
}

function toHits(response: { body: { hits: { hits: unknown[] } } }): SearchHit[] {
  return response.body.hits.hits.map((raw) => {
    const hit = raw as {
      _score: number;
      _source: DocumentChunkFields;
      highlight?: Record<string, string[]>;
    };
    return {
      ...hit._source,
      score: hit._score,
      highlights: hit.highlight?.[FIELD.content] ?? [],
    };
  });
}

function isAlreadyExistsError(error: unknown): boolean {
  const body = (error as { body?: { error?: { type?: string } } })?.body;
  return body?.error?.type === "resource_already_exists_exception";
}

export { DEFAULT_MAX_CHUNK_SIZE, getChunkId };
export type { SearchFilters, DocumentChunk, DocumentChunkFields };
