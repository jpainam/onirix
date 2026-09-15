/**
 * Process-wide service singletons.
 *
 * Next.js re-evaluates modules on hot reload, so clients that hold connection
 * pools are cached on `globalThis` to avoid exhausting Postgres/Redis
 * connections during development.
 */
import { createAuth } from "@onirix/auth";
import { type Database, createDb } from "@onirix/db";
import { createQueueClient } from "@onirix/jobs";
import { createStorageClient, ensureBucket } from "@onirix/ingestion";
import { DocumentIndex, createSearchClient, getIndexName } from "@onirix/search";
import type { Redis } from "ioredis";
import type { S3Client } from "@aws-sdk/client-s3";

import { env } from "./env.server";

type ServiceCache = {
  db?: Database;
  redis?: Redis;
  storage?: S3Client;
  bucketReady?: Promise<void>;
};

const cache: ServiceCache = ((globalThis as { __onirix?: ServiceCache }).__onirix ??= {});

export function getDb(): Database {
  return (cache.db ??= createDb(env));
}

export function getQueue(): Redis {
  return (cache.redis ??= createQueueClient(env.REDIS_URL));
}

export function getStorage(): S3Client {
  return (cache.storage ??= createStorageClient(env));
}

/** Creates the upload bucket on first use. Idempotent and cached per process. */
export function ensureStorageReady(): Promise<void> {
  return (cache.bucketReady ??= ensureBucket(getStorage(), env.S3_BUCKET));
}

export const auth = createAuth(env, getDb());

/**
 * Builds the document index handle for a workspace's embedding configuration.
 *
 * Index name and vector dimension both derive from the embedding model, so a
 * workspace that changes models reads and writes a different index.
 */
export function getDocumentIndex(embeddingModel: string, dimension: number): DocumentIndex {
  const client = createSearchClient(env);
  return new DocumentIndex(client, getIndexName(embeddingModel), dimension);
}
