/**
 * Background worker.
 *
 * Pulls jobs off the Redis queue: documents to extract and embed, sources to
 * read end to end, permissions and groupings to mirror into the index, and
 * leftovers to purge. This is the TypeScript counterpart to Onyx's Celery
 * background workers and its connector scheduler, in one process.
 *
 * Several jobs run at once, bounded by `WORKER_CONCURRENCY`, so a long crawl
 * of a website does not hold up the upload that arrived after it.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, ne, or, isNull, sql } from "drizzle-orm";

import { CONNECTOR_TYPES, ConnectorError, createConnector } from "@onirix/connectors";
import { createDb } from "@onirix/db";
import { isOrganizationWide, resolveDocumentAcl } from "@onirix/db/access";
import { readConnectorConfig } from "@onirix/db/connectors";
import { runMigrations } from "@onirix/db/migrate";
import { document, documentTeam, llmConfig, source, sourceSyncRun } from "@onirix/db/schema";
import { createSecretBox } from "@onirix/db/secrets";
import {
  UnsupportedFileTypeError,
  buildFileKey,
  createStorageClient,
  deleteFile,
  ensureBucket,
  getFile,
  indexDocument,
  putFile,
} from "@onirix/ingestion";
import {
  MAX_INDEX_ATTEMPTS,
  acknowledge,
  acquireLock,
  createQueueClient,
  enqueue,
  recoverAbandoned,
  releaseLock,
  renewLock,
  reserve,
  type Job,
} from "@onirix/jobs";
import type { ProviderCredentials } from "@onirix/llm";
import { DocumentIndex, createSearchClient, getIndexName } from "@onirix/search";

import { ENV as env } from "./env";

const db = createDb(env);
// Credentials are stored sealed; the worker holds the same key as the web
// process and nothing else about the workspace's secrets.
const secrets = createSecretBox(env.SECRETS_ENCRYPTION_KEY);
const queue = createQueueClient(env.REDIS_URL);
const storage = createStorageClient(env);
const searchClient = createSearchClient(env);

const concurrency = Math.max(1, Math.min(8, Math.floor(env.WORKER_CONCURRENCY || 2)));

/** How often the scheduler looks for sources whose interval has elapsed. */
const SCHEDULER_TICK_MS = 60_000;
/** A sync's lease on its source. Renewed as documents arrive. */
const SYNC_LOCK_SECONDS = 15 * 60;

let shuttingDown = false;
/** Fired on shutdown so a crawl in progress stops at its next page. */
const shutdown = new AbortController();

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

  console.log(`[worker] ready, ${concurrency} lane(s), waiting for jobs`);

  await Promise.all([...Array.from({ length: concurrency }, (_, lane) => runLane(lane)), runScheduler()]);

  console.log("[worker] shut down cleanly");
}

/** One consumer loop. Lanes share the queue and never the same job. */
async function runLane(lane: number): Promise<void> {
  while (!shuttingDown) {
    const reserved = await reserve(queue, 5);
    if (!reserved) continue;

    const { job } = reserved;
    try {
      await handle(job);
    } catch (error) {
      console.error(`[worker:${lane}] job failed`, job.type, error);
      await recordFailure(job, error);
    } finally {
      await acknowledge(queue, reserved);
    }
  }
}

async function handle(job: Job): Promise<void> {
  switch (job.type) {
    case "sync_document_access":
      return syncDocumentAccess(job);
    case "sync_document_collection":
      return syncDocumentCollection(job);
    case "sync_source":
      return syncSource(job);
    case "purge_documents":
      return purgeDocuments(job);
    case "index_document":
      return indexOneDocument(job);
  }
}

/**
 * The index handle for a workspace, or null when it has not chosen a model.
 *
 * Index name and vector dimension both come from the embedding model, so the
 * handle is per workspace and per configuration.
 */
async function indexFor(organizationId: string): Promise<{
  index: DocumentIndex;
  config: typeof llmConfig.$inferSelect;
} | null> {
  const config = await db.query.llmConfig.findFirst({
    where: eq(llmConfig.organizationId, organizationId),
  });
  if (!config) return null;
  return {
    config,
    index: new DocumentIndex(
      searchClient,
      getIndexName(config.embeddingModel),
      Number(config.embeddingDimension),
    ),
  };
}

/**
 * Mirrors a document's current permissions onto its indexed chunks.
 *
 * Until this runs, retrieval still enforces whatever the chunks last said, so
 * a visibility change is not complete when the database row is updated — it is
 * complete when this finishes.
 */
async function syncDocumentAccess(job: Extract<Job, { type: "sync_document_access" }>): Promise<void> {
  const doc = await db.query.document.findFirst({ where: eq(document.id, job.documentId) });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }
  const handle = await indexFor(job.organizationId);
  if (!handle) throw new Error("Organization has no model configuration.");

  await handle.index.updateDocumentAccess(job.organizationId, doc.id, {
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
async function syncDocumentCollection(
  job: Extract<Job, { type: "sync_document_collection" }>,
): Promise<void> {
  const doc = await db.query.document.findFirst({ where: eq(document.id, job.documentId) });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }
  const handle = await indexFor(job.organizationId);
  if (!handle) throw new Error("Organization has no model configuration.");

  await handle.index.updateDocumentSets(
    job.organizationId,
    doc.id,
    doc.collectionId ? [doc.collectionId] : [],
  );
  console.log(`[worker] collection updated for "${doc.title}" (${doc.collectionId ?? "none"})`);
}

async function indexOneDocument(job: Extract<Job, { type: "index_document" }>): Promise<void> {
  const started = Date.now();

  const doc = await db.query.document.findFirst({
    where: eq(document.id, job.documentId),
    with: { source: { columns: { type: true } } },
  });
  if (!doc) {
    console.warn(`[worker] document ${job.documentId} no longer exists, skipping`);
    return;
  }
  if (!doc.fileKey) throw new Error("Document has no stored file to index.");

  const handle = await indexFor(job.organizationId);
  if (!handle) throw new Error("Organization has no model configuration.");
  const { config, index } = handle;

  await db
    .update(document)
    .set({ status: "processing", indexError: null })
    .where(eq(document.id, doc.id));

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
      sourceType: doc.source.type,
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

  await refreshSourceCount(doc.sourceId, doc.source.type === "file_upload");

  console.log(
    `[worker] indexed "${doc.title}" -> ${chunkCount} chunk(s) in ${Date.now() - started}ms`,
  );
}

/**
 * Keeps `source.document_count` equal to the rows it has, rather than
 * counting up on every successful index: a retry or a re-sync must not make
 * a source look bigger than it is.
 */
async function refreshSourceCount(sourceId: string, touchSyncedAt: boolean): Promise<void> {
  await db
    .update(source)
    .set({
      documentCount: sql`(select count(*) from ${document} where ${document.sourceId} = ${source.id})`,
      ...(touchSyncedAt ? { lastSyncedAt: new Date() } : {}),
    })
    .where(eq(source.id, sourceId));
}

/**
 * Reads a connected source in full and reconciles what it stored last time.
 *
 * Each document the connector yields is matched by its external id: same
 * bytes as before and it is stamped as seen; different or new and it is stored
 * and queued for indexing. When the read completes, whatever was not seen has
 * gone from the source and is removed. A read that fails part-way removes
 * nothing: a half-crawled site is not evidence that the other half is gone.
 */
async function syncSource(job: Extract<Job, { type: "sync_source" }>): Promise<void> {
  const run = await db.query.sourceSyncRun.findFirst({ where: eq(sourceSyncRun.id, job.runId) });
  if (!run) {
    console.warn(`[worker] sync run ${job.runId} no longer exists, skipping`);
    return;
  }

  const src = await db.query.source.findFirst({
    where: and(eq(source.id, job.sourceId), eq(source.organizationId, job.organizationId)),
    with: { defaultTeams: true },
  });
  if (!src) {
    await finishRun(job.runId, null, { status: "failed", error: "The source no longer exists." });
    return;
  }

  const lockName = `sync:${src.id}`;
  if (!(await acquireLock(queue, lockName, SYNC_LOCK_SECONDS))) {
    await finishRun(job.runId, src.id, {
      status: "failed",
      error: "Another sync of this source was already running.",
    });
    return;
  }

  const started = Date.now();
  const counters = { seen: 0, added: 0, updated: 0, removed: 0, unchanged: 0 };
  const notes: string[] = [];
  let lastFlush = Date.now();

  try {
    const config = readConnectorConfig(src.config, secrets);
    if (!config) throw new ConnectorError("config", "The source's settings could not be read. Edit and save them again.");

    await db.transaction(async (tx) => {
      await tx
        .update(sourceSyncRun)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(sourceSyncRun.id, job.runId));
      await tx.update(source).set({ status: "in_progress", lastError: null }).where(eq(source.id, src.id));
    });

    const connector = createConnector(config, {
      allowPrivateNetworks: env.CONNECTOR_ALLOW_PRIVATE_NETWORKS,
      firecrawlApiKey: env.FIRECRAWL_API_KEY || null,
    });
    const teamIds = src.defaultTeams.map((entry) => entry.teamId);
    const visibility = src.defaultVisibility;
    const accessControlList = resolveDocumentAcl({ visibility, teamIds, uploadedBy: null });

    console.log(`[worker] syncing "${src.name}" (${src.type})`);

    for await (const item of connector.documents({
      signal: shutdown.signal,
      log: (message) => {
        notes.push(message);
        console.log(`[worker] ${src.name}: ${message}`);
      },
    })) {
      if (shutdown.signal.aborted) throw new Error("The worker shut down during the sync.");
      counters.seen += 1;

      const contentHash = sha256(item.body);
      const existing = await db.query.document.findFirst({
        where: and(eq(document.sourceId, src.id), eq(document.externalId, item.externalId)),
        columns: { id: true, contentHash: true, status: true, fileKey: true },
      });

      if (existing && existing.contentHash === contentHash && existing.status !== "failed") {
        await db
          .update(document)
          .set({
            lastSyncRunId: job.runId,
            title: item.title,
            sourceUrl: item.sourceUrl,
            sourceUpdatedAt: item.sourceUpdatedAt,
          })
          .where(eq(document.id, existing.id));
        counters.unchanged += 1;
      } else {
        const documentId = existing?.id ?? randomUUID();
        const fileKey = buildFileKey(job.organizationId, documentId, item.title);
        await putFile(storage, env.S3_BUCKET, fileKey, item.body, item.mimeType);

        if (existing) {
          await db
            .update(document)
            .set({
              title: item.title,
              sourceUrl: item.sourceUrl,
              fileKey,
              mimeType: item.mimeType,
              sizeBytes: item.body.byteLength,
              contentHash,
              status: "pending",
              indexError: null,
              lastSyncRunId: job.runId,
              sourceUpdatedAt: item.sourceUpdatedAt,
            })
            .where(eq(document.id, existing.id));
          if (existing.fileKey && existing.fileKey !== fileKey) {
            await deleteFile(storage, env.S3_BUCKET, existing.fileKey).catch(() => undefined);
          }
          counters.updated += 1;
        } else {
          await db.transaction(async (tx) => {
            await tx.insert(document).values({
              id: documentId,
              organizationId: job.organizationId,
              sourceId: src.id,
              externalId: item.externalId,
              title: item.title,
              sourceUrl: item.sourceUrl,
              fileKey,
              mimeType: item.mimeType,
              sizeBytes: item.body.byteLength,
              contentHash,
              status: "pending",
              visibility,
              accessControlList,
              lastSyncRunId: job.runId,
              sourceUpdatedAt: item.sourceUpdatedAt,
            });
            if (visibility === "teams" && teamIds.length > 0) {
              await tx.insert(documentTeam).values(teamIds.map((teamId) => ({ documentId, teamId })));
            }
          });
          counters.added += 1;
        }

        await enqueue(queue, { type: "index_document", organizationId: job.organizationId, documentId });
      }

      // Progress reaches the Sources page as it happens, and the lease on the
      // source outlives a slow site.
      if (Date.now() - lastFlush > 5_000) {
        lastFlush = Date.now();
        await renewLock(queue, lockName, SYNC_LOCK_SECONDS);
        await db.update(sourceSyncRun).set(runCounters(counters)).where(eq(sourceSyncRun.id, job.runId));
      }
    }

    // Everything of this source the run did not stamp is no longer at the source.
    const stale = await db
      .select({ id: document.id, fileKey: document.fileKey })
      .from(document)
      .where(
        and(
          eq(document.sourceId, src.id),
          or(isNull(document.lastSyncRunId), ne(document.lastSyncRunId, job.runId)),
        ),
      );
    if (stale.length > 0) {
      const handle = await indexFor(job.organizationId);
      for (const row of stale) {
        if (handle) await handle.index.deleteDocument(job.organizationId, row.id).catch(() => undefined);
        if (row.fileKey) await deleteFile(storage, env.S3_BUCKET, row.fileKey).catch(() => undefined);
      }
      await db.delete(document).where(
        and(
          eq(document.sourceId, src.id),
          or(isNull(document.lastSyncRunId), ne(document.lastSyncRunId, job.runId)),
        ),
      );
      counters.removed = stale.length;
    }

    await finishRun(job.runId, src.id, {
      status: "success",
      error: null,
      notes: notes.length > 0 ? notes.slice(-20).join("\n") : null,
      ...runCounters(counters),
    });

    console.log(
      `[worker] synced "${src.name}": ${counters.seen} seen, ${counters.added} added, ${counters.updated} updated, ${counters.unchanged} unchanged, ${counters.removed} removed in ${Date.now() - started}ms`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] sync of "${src.name}" failed:`, message);
    await finishRun(job.runId, src.id, {
      status: "failed",
      error: message,
      notes: notes.length > 0 ? notes.slice(-20).join("\n") : null,
      ...runCounters(counters),
    });
  } finally {
    await releaseLock(queue, lockName);
  }
}

function runCounters(counters: { seen: number; added: number; updated: number; removed: number; unchanged: number }) {
  return {
    documentsSeen: counters.seen,
    documentsAdded: counters.added,
    documentsUpdated: counters.updated,
    documentsRemoved: counters.removed,
    documentsUnchanged: counters.unchanged,
  };
}

/** Closes a run and mirrors its outcome onto the source row the page reads. */
async function finishRun(
  runId: string,
  sourceId: string | null,
  outcome: Partial<typeof sourceSyncRun.$inferInsert> & { status: "success" | "failed"; error?: string | null },
): Promise<void> {
  const finishedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(sourceSyncRun)
      .set({ ...outcome, finishedAt })
      .where(eq(sourceSyncRun.id, runId));
    if (sourceId) {
      await tx
        .update(source)
        .set({
          status: outcome.status,
          lastError: outcome.error ?? null,
          ...(outcome.status === "success" ? { lastSyncedAt: finishedAt } : {}),
          documentCount: sql`(select count(*) from ${document} where ${document.sourceId} = ${source.id})`,
        })
        .where(eq(source.id, sourceId));
    }
  });
}

/** Removes chunks and stored originals of documents whose rows are already gone. */
async function purgeDocuments(job: Extract<Job, { type: "purge_documents" }>): Promise<void> {
  const handle = await indexFor(job.organizationId);
  for (const row of job.documents) {
    if (handle) await handle.index.deleteDocument(job.organizationId, row.id).catch(() => undefined);
    if (row.fileKey) await deleteFile(storage, env.S3_BUCKET, row.fileKey).catch(() => undefined);
  }
  console.log(`[worker] purged ${job.documents.length} document(s)`);
}

/**
 * Queues a sync for every source whose interval has elapsed since its last
 * run, successful or not.
 *
 * Measured from the last run rather than the last success: a source that
 * fails would otherwise be retried every tick instead of every interval. One
 * scheduler at a time across replicas, by lease.
 */
async function runScheduler(): Promise<void> {
  while (!shuttingDown) {
    await sleep(SCHEDULER_TICK_MS);
    if (shuttingDown) break;
    if (!(await acquireLock(queue, "scheduler", Math.floor(SCHEDULER_TICK_MS / 1000) - 5))) continue;

    try {
      const due = await db
        .select({ id: source.id, organizationId: source.organizationId, name: source.name })
        .from(source)
        .where(
          and(
            sql`${source.type} in (${sql.join(
              CONNECTOR_TYPES.map((type) => sql`${type}`),
              sql`, `,
            )})`,
            sql`${source.syncIntervalMinutes} is not null`,
            sql`${source.status} not in ('queued', 'in_progress')`,
            sql`not exists (
              select 1 from ${sourceSyncRun}
              where ${sourceSyncRun.sourceId} = ${source.id}
                and ${sourceSyncRun.createdAt} > now() - make_interval(mins => ${source.syncIntervalMinutes})
            )`,
          ),
        );

      for (const row of due) {
        const runId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(sourceSyncRun).values({
            id: runId,
            organizationId: row.organizationId,
            sourceId: row.id,
            status: "queued",
          });
          await tx.update(source).set({ status: "queued" }).where(eq(source.id, row.id));
        });
        await enqueue(queue, {
          type: "sync_source",
          organizationId: row.organizationId,
          sourceId: row.id,
          runId,
        });
        console.log(`[worker] scheduled sync of "${row.name}"`);
      }
    } catch (error) {
      console.error("[worker] scheduler tick failed", error);
    }
  }
}

/**
 * What a failed job leaves behind.
 *
 * An indexing failure that looks transient (a provider timeout, a network
 * blip) is retried a bounded number of times; one that cannot succeed (a file
 * type nothing extracts) is not. A failed permission sync leaves a perfectly
 * well-indexed document, and flagging it "failed" would invite an admin to
 * retry an expensive re-index that fixes nothing.
 */
async function recordFailure(job: Job, error: unknown): Promise<void> {
  if (job.type !== "index_document") return;

  const reason = error instanceof Error ? error.message : String(error);
  const permanent = error instanceof UnsupportedFileTypeError;
  const nextAttempt = job.attempt + 1;

  try {
    if (!permanent && nextAttempt < MAX_INDEX_ATTEMPTS && !shuttingDown) {
      await db
        .update(document)
        .set({ status: "pending", indexError: `Retrying after: ${reason}` })
        .where(eq(document.id, job.documentId));
      await enqueue(queue, { ...job, attempt: nextAttempt });
      console.log(`[worker] will retry ${job.documentId} (attempt ${nextAttempt + 1} of ${MAX_INDEX_ATTEMPTS})`);
      return;
    }
    await db
      .update(document)
      .set({ status: "failed", indexError: reason })
      .where(eq(document.id, job.documentId));
  } catch (dbError) {
    console.error("[worker] could not record failure", dbError);
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    shutdown.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Finish the in-flight job before exiting so it is not replayed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    console.log(`[worker] ${signal} received, finishing current jobs`);
    shuttingDown = true;
    shutdown.abort();
  });
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
