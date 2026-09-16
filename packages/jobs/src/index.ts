/**
 * Redis-backed job queue for background work.
 *
 * Deliberately small: a reliable-queue pattern over two Redis lists, which is
 * all the indexing workload needs. Onyx uses Celery for the same role.
 */
import { Redis } from "ioredis";
import { z } from "zod";

const QUEUE_KEY = "onirix:jobs:pending";
/** Jobs move here while a worker holds them, so a crash cannot lose one. */
const PROCESSING_KEY = "onirix:jobs:processing";

/** How many times an indexing job is retried before the document is marked failed. */
export const MAX_INDEX_ATTEMPTS = 3;

export const indexDocumentJobSchema = z.object({
  type: z.literal("index_document"),
  organizationId: z.string(),
  documentId: z.string(),
  /** Zero-based. The worker re-enqueues with `attempt + 1` on a transient failure. */
  attempt: z.number().int().min(0).default(0),
});

/**
 * Pushes a document's current permissions into its already-indexed chunks.
 *
 * Its own job type rather than a re-index: the text has not changed, so paying
 * to re-extract and re-embed it would be waste. It is also the reason a
 * visibility change is not instant — until the worker picks this up, retrieval
 * still enforces the previous permissions.
 */
export const syncDocumentAccessJobSchema = z.object({
  type: z.literal("sync_document_access"),
  organizationId: z.string(),
  documentId: z.string(),
});

/**
 * Pushes a document's current collection into its already-indexed chunks.
 *
 * Same reasoning as the access sync: moving a document between collections
 * changes one keyword field, not the text, so re-extracting and re-embedding it
 * would be waste. Until the worker picks this up, a collection-scoped search
 * still answers from the previous grouping.
 */
export const syncDocumentCollectionJobSchema = z.object({
  type: z.literal("sync_document_collection"),
  organizationId: z.string(),
  documentId: z.string(),
});

/**
 * Reads a connected source end to end and reconciles its documents.
 *
 * `runId` names the `source_sync_run` row the API created when it queued the
 * job, so the Sources page can show "queued" before any worker picks it up and
 * the run's outcome lands on a row that already exists.
 */
export const syncSourceJobSchema = z.object({
  type: z.literal("sync_source"),
  organizationId: z.string(),
  sourceId: z.string(),
  runId: z.string(),
});

/**
 * Removes what remains of documents whose rows are already gone: chunks in
 * the search index and originals in object storage.
 *
 * Deleting a source cascades its rows away in one statement, but nothing in
 * Postgres can reach the other two stores, so the ids and keys travel here.
 * Batched by the caller so one removed website does not become one enormous
 * job.
 */
export const purgeDocumentsJobSchema = z.object({
  type: z.literal("purge_documents"),
  organizationId: z.string(),
  documents: z
    .array(z.object({ id: z.string(), fileKey: z.string().nullable() }))
    .min(1)
    .max(500),
});

export const jobSchema = z.discriminatedUnion("type", [
  indexDocumentJobSchema,
  syncDocumentAccessJobSchema,
  syncDocumentCollectionJobSchema,
  syncSourceJobSchema,
  purgeDocumentsJobSchema,
]);
export type Job = z.infer<typeof jobSchema>;
export type JobInput = z.input<typeof jobSchema>;

/**
 * A job as a worker holds it.
 *
 * `raw` is the exact string on the processing list. Acknowledging has to
 * remove that string, not a re-serialization of the parsed job: schema
 * defaults would make the two differ, and a job that cannot be removed is
 * replayed on every worker restart.
 */
export type ReservedJob = { job: Job; raw: string };

export function createQueueClient(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export async function enqueue(redis: Redis, job: JobInput): Promise<void> {
  await redis.lpush(QUEUE_KEY, JSON.stringify(jobSchema.parse(job)));
}

/**
 * Blocks until a job is available or `timeoutSeconds` elapses.
 *
 * The job is atomically moved to the processing list; call `acknowledge` once
 * it is done so it is not replayed.
 */
export async function reserve(redis: Redis, timeoutSeconds = 5): Promise<ReservedJob | null> {
  const raw = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, timeoutSeconds);
  if (!raw) return null;

  let parsed: ReturnType<typeof jobSchema.safeParse>;
  try {
    parsed = jobSchema.safeParse(JSON.parse(raw));
  } catch {
    parsed = { success: false } as ReturnType<typeof jobSchema.safeParse>;
  }
  if (!parsed.success) {
    // Unparseable payload: drop it rather than blocking the queue forever.
    await redis.lrem(PROCESSING_KEY, 1, raw);
    return null;
  }
  return { job: parsed.data, raw };
}

export async function acknowledge(redis: Redis, reserved: ReservedJob): Promise<void> {
  await redis.lrem(PROCESSING_KEY, 1, reserved.raw);
}

/**
 * Returns jobs abandoned by a crashed worker to the pending queue.
 * Call on worker startup.
 */
export async function recoverAbandoned(redis: Redis): Promise<number> {
  let recovered = 0;
  while (await redis.rpoplpush(PROCESSING_KEY, QUEUE_KEY)) {
    recovered += 1;
  }
  return recovered;
}

export async function queueDepth(redis: Redis): Promise<number> {
  return redis.llen(QUEUE_KEY);
}

const LOCK_PREFIX = "onirix:lock:";

/**
 * Takes a lease on a name, or reports that someone holds it.
 *
 * What keeps two workers from syncing the same source at once, and what keeps
 * two replicas of the scheduler from queueing the same source twice. The lease
 * expires on its own so a worker that dies mid-sync does not lock the source
 * for good; a long sync renews it as it goes.
 */
export async function acquireLock(redis: Redis, name: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(`${LOCK_PREFIX}${name}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function renewLock(redis: Redis, name: string, ttlSeconds: number): Promise<void> {
  await redis.expire(`${LOCK_PREFIX}${name}`, ttlSeconds);
}

export async function releaseLock(redis: Redis, name: string): Promise<void> {
  await redis.del(`${LOCK_PREFIX}${name}`);
}
