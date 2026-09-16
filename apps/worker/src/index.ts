/**
 * Background indexing worker.
 *
 * Pulls documents off the Redis queue, extracts and embeds them, and writes the
 * chunks to OpenSearch. This is the TypeScript counterpart to Onyx's Celery
 * background workers.
 */
import { eq, sql } from "drizzle-orm";

import { createDb } from "@onirix/db";
import { createSecretBox } from "@onirix/db/secrets";
import { isOrganizationWide } from "@onirix/db/access";
import { runMigrations } from "@onirix/db/migrate";
import { document, llmConfig, source } from "@onirix/db/schema";
import {
  createStorageClient,
  ensureBucket,
  getFile,
  indexDocument,
} from "@onirix/ingestion";
import {
  acknowledge,
  createQueueClient,
  recoverAbandoned,
  reserve,
  type Job,
} from "@onirix/jobs";
import type { ProviderCredentials } from "@onirix/llm";
import { DocumentIndex, createSearchClient, getIndexName } from "@onirix/search";

import { ENV as env } from "./env";

const db = createDb(env);
// Embedding keys are stored sealed; the worker holds the same key as the web
// process and nothing else about the workspace's credentials.
const secrets = createSecretBox(env.SECRETS_ENCRYPTION_KEY);
const queue = createQueueClient(env.REDIS_URL);
const storage = createStorageClient(env);
const searchClient = createSearchClient(env);

let shuttingDown = false;

async function main() {
  console.log("[worker] starting");

  // The worker owns schema migration: it is the one service guaranteed to run
  // exactly once per deployment, so a fresh stack provisions itself.
  await runMigrations(env);
  console.log("[worker] schema up to date");

  await ensureBucket(storage, env.S3_BUCKET);

  // A worker that died mid-job left it on the processing list; put it back.
  const recovered = await recoverAbandoned(queue);
  if (recovered > 0) {
    console.log(`[worker] recovered ${recovered} abandoned job(s)`);
  }

  console.log("[worker] ready, waiting for jobs");

  while (!shuttingDown) {
    const job = await reserve(queue, 5);
    if (!job) continue;

    try {
      await handle(job);
    } catch (error) {
      console.error(`[worker] job failed`, job, error);
      await markFailed(job, error);
    } finally {
      await acknowledge(queue, job);
    }
  }

  console.log("[worker] shut down cleanly");
}

async function handle(job: Job): Promise<void> {
  if (job.type === "sync_document_access") {
    await syncDocumentAccess(job);
    return;
  }
  if (job.type === "sync_document_collection") {
    await syncDocumentCollection(job);
    return;
  }

  await indexOneDocument(job);
}

/**
 * Mirrors a document's current permissions onto its indexed chunks.
 *
 * Until this runs, retrieval still enforces whatever the chunks last said, so
 * a visibility change is not complete when the database row is updated — it is
 * complete when this finishes.
 */
async function syncDocumentAccess(job: Job): Promise<void> {
  const doc = await db.query.document.findFirst({
    where: eq(document.id, job.documentId),
  });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }

  const config = await db.query.llmConfig.findFirst({
    where: eq(llmConfig.organizationId, job.organizationId),
  });
  if (!config) {
    throw new Error("Organization has no model configuration.");
  }

  const index = new DocumentIndex(
    searchClient,
    getIndexName(config.embeddingModel),
    Number(config.embeddingDimension),
  );

  await index.updateDocumentAccess(job.organizationId, doc.id, {
    isPublic: isOrganizationWide(doc.visibility),
    accessControlList: doc.accessControlList,
  });

  console.log(`[worker] access updated for "${doc.title}" (${doc.visibility})`);
}

/**
 * Mirrors a document's current collection onto its indexed chunks.
 *
 * Retrieval reads the grouping from the chunks, so a document moved into
 * "Engineering" is not in it, as far as search is concerned, until this runs.
 */
async function syncDocumentCollection(job: Job): Promise<void> {
  const doc = await db.query.document.findFirst({
    where: eq(document.id, job.documentId),
  });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }

  const config = await db.query.llmConfig.findFirst({
    where: eq(llmConfig.organizationId, job.organizationId),
  });
  if (!config) {
    throw new Error("Organization has no model configuration.");
  }

  const index = new DocumentIndex(
    searchClient,
    getIndexName(config.embeddingModel),
    Number(config.embeddingDimension),
  );

  await index.updateDocumentSets(
    job.organizationId,
    doc.id,
    doc.collectionId ? [doc.collectionId] : [],
  );

  console.log(
    `[worker] collection updated for "${doc.title}" (${doc.collectionId ?? "none"})`,
  );
}

async function indexOneDocument(job: Job): Promise<void> {
  const started = Date.now();

  const doc = await db.query.document.findFirst({
    where: eq(document.id, job.documentId),
  });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }
  if (!doc.fileKey) {
    throw new Error("Document has no stored file to index.");
  }

  const config = await db.query.llmConfig.findFirst({
    where: eq(llmConfig.organizationId, job.organizationId),
  });
  if (!config) {
    throw new Error("Organization has no model configuration.");
  }

  await db
    .update(document)
    .set({ status: "processing", indexError: null })
    .where(eq(document.id, doc.id));

  const dimension = Number(config.embeddingDimension);
  const index = new DocumentIndex(
    searchClient,
    getIndexName(config.embeddingModel),
    dimension,
  );
  await index.ensureReady();

  const buffer = await getFile(storage, env.S3_BUCKET, doc.fileKey);

  // The workspace's own key, pasted into the dashboard; the worker holds no
  // credentials of its own.
  const embeddingCredentials: ProviderCredentials = {
    provider: config.embeddingProvider as ProviderCredentials["provider"],
    apiKey: config.embeddingApiKey ? secrets.open(config.embeddingApiKey) : null,
    baseUrl: config.embeddingBaseUrl,
  };

  const { chunkCount } = await indexDocument(
    {
      organizationId: job.organizationId,
      documentId: doc.id,
      title: doc.title,
      sourceType: "file_upload",
      sourceUrl: doc.sourceUrl,
      mimeType: doc.mimeType ?? "text/plain",
      fileName: doc.title,
      buffer,
      // Both come straight from the row: `accessControlList` was written by
      // `resolveDocumentAcl`, which is the only thing allowed to compute it.
      isPublic: isOrganizationWide(doc.visibility),
      accessControlList: doc.accessControlList,
      collectionIds: doc.collectionId ? [doc.collectionId] : undefined,
      sourceUpdatedAt: doc.sourceUpdatedAt,
    },
    { index, embeddingCredentials, embeddingModelId: config.embeddingModel },
  );

  await db
    .update(document)
    .set({ status: "indexed", chunkCount, indexError: null })
    .where(eq(document.id, doc.id));

  // Keep the source's document count in step for the Sources page.
  await db
    .update(source)
    .set({ documentCount: sql`${source.documentCount} + 1`, lastSyncedAt: new Date() })
    .where(eq(source.id, doc.sourceId));

  console.log(
    `[worker] indexed "${doc.title}" -> ${chunkCount} chunk(s) in ${Date.now() - started}ms`,
  );
}

async function markFailed(job: Job, error: unknown): Promise<void> {
  // Only indexing failures belong on the document. A failed permission sync
  // leaves a perfectly well-indexed document, and flagging it "failed" would
  // invite an admin to retry an expensive re-index that fixes nothing.
  if (job.type !== "index_document") return;

  const reason = error instanceof Error ? error.message : String(error);
  try {
    await db
      .update(document)
      .set({ status: "failed", indexError: reason })
      .where(eq(document.id, job.documentId));
  } catch (dbError) {
    console.error("[worker] could not record failure", dbError);
  }
}

// Finish the in-flight job before exiting so it is not replayed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    console.log(`[worker] ${signal} received, finishing current job`);
    shuttingDown = true;
  });
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
