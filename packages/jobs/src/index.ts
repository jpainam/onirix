/**
 * Redis-backed job queue for background indexing.
 *
 * Deliberately small: a reliable-queue pattern over two Redis lists, which is
 * all the indexing workload needs. Onyx uses Celery for the same role.
 */
import { Redis } from "ioredis";
import { z } from "zod";

const QUEUE_KEY = "onirix:jobs:pending";
/** Jobs move here while a worker holds them, so a crash cannot lose one. */
const PROCESSING_KEY = "onirix:jobs:processing";

export const indexDocumentJobSchema = z.object({
  type: z.literal("index_document"),
  organizationId: z.string(),
  documentId: z.string(),
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

export const jobSchema = z.discriminatedUnion("type", [
  indexDocumentJobSchema,
  syncDocumentAccessJobSchema,
  syncDocumentCollectionJobSchema,
]);
export type Job = z.infer<typeof jobSchema>;

export function createQueueClient(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export async function enqueue(redis: Redis, job: Job): Promise<void> {
  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
}

/**
 * Blocks until a job is available or `timeoutSeconds` elapses.
 *
 * The job is atomically moved to the processing list; call `acknowledge` once
 * it is done so it is not replayed.
 */
export async function reserve(redis: Redis, timeoutSeconds = 5): Promise<Job | null> {
  const raw = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, timeoutSeconds);
  if (!raw) return null;

  const parsed = jobSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    // Unparseable payload: drop it rather than blocking the queue forever.
    await redis.lrem(PROCESSING_KEY, 1, raw);
    return null;
  }
  return parsed.data;
}

export async function acknowledge(redis: Redis, job: Job): Promise<void> {
  await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
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
