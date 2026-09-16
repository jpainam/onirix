/**
 * Process-wide service singletons.
 *
 * Next.js re-evaluates modules on hot reload, so clients that hold connection
 * pools are cached on `globalThis` to avoid exhausting Postgres/Redis
 * connections during development.
 *
 * The cost is that the Drizzle client keeps the schema snapshot it was built
 * from: adding a table or a relation needs the dev server restarted, or the
 * next query using it fails inside drizzle with an undefined relation.
 */
import { createAuth } from "@onirix/auth";
import { type Database, createDb } from "@onirix/db";
import { createSecretBox, type SecretBox } from "@onirix/db/secrets";
import { createQueueClient } from "@onirix/jobs";
import { createStorageClient, ensureBucket } from "@onirix/ingestion";
import { DocumentIndex, createSearchClient, getIndexName } from "@onirix/search";
import { Redis } from "ioredis";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream/ioredis";
import type { ResumableStreamContext } from "resumable-stream/ioredis";
import type { S3Client } from "@aws-sdk/client-s3";

import { env } from "./env.server";

type ServiceCache = {
  db?: Database;
  secrets?: SecretBox;
  redis?: Redis;
  streamCommands?: Redis;
  streamSubscriber?: Redis;
  resumableStreams?: ResumableStreamContext;
  storage?: S3Client;
  search?: ReturnType<typeof createSearchClient>;
  bucketReady?: Promise<void>;
};

const cache: ServiceCache = ((globalThis as { __onirix?: ServiceCache }).__onirix ??= {});

export function getDb(): Database {
  return (cache.db ??= createDb(env));
}

/** The box every stored credential goes through. Built once; the key never changes at runtime. */
export function getSecrets(): SecretBox {
  return (cache.secrets ??= createSecretBox(env.SECRETS_ENCRYPTION_KEY));
}

export function getQueue(): Redis {
  return (cache.redis ??= createQueueClient(env.REDIS_URL));
}

/**
 * Everything these connections carry is in service of recovering an answer, so
 * they are configured to fail rather than wait.
 *
 * ioredis queues commands while it reconnects, which is right for work that has
 * to happen eventually and wrong here: it would let a Redis outage hang the
 * very answers resumability exists to protect. The timeout is generous enough
 * to cover a cold start — the first request after boot races the initial
 * connection — and short enough that an outage degrades in a couple of seconds
 * to a chat that simply cannot be resumed.
 */
const STREAM_REDIS_OPTIONS = { commandTimeout: 2_000 };

/**
 * Redis handle for the bookkeeping around resumable answer streams.
 *
 * Separate from the queue client, which is configured for blocking reads, and
 * separate again from the subscriber below: a connection in subscriber mode
 * cannot issue ordinary commands.
 */
export function getStreamRedis(): Redis {
  return (cache.streamCommands ??= new Redis(env.REDIS_URL, STREAM_REDIS_OPTIONS));
}

/**
 * The pub/sub context that lets an answer outlive the request that asked for
 * it.
 *
 * Generation is pumped into this context, not into the HTTP response, so a
 * reader who refreshes or drops off the network does not cancel the model —
 * their next request re-attaches to the same stream and replays what it missed.
 */
export function getResumableStreamContext(): ResumableStreamContext {
  return (cache.resumableStreams ??= createResumableStreamContext({
    keyPrefix: "onirix:chat",
    // Onirix runs as a long-lived server, where a promise left running needs
    // nothing to keep it alive. `after` is what matters on a platform that
    // freezes the function the moment its response ends, and it throws outside
    // a request — which is exactly the case where it is not needed.
    waitUntil: (promise) => {
      try {
        after(promise);
      } catch {
        void promise;
      }
    },
    publisher: getStreamRedis(),
    subscriber: (cache.streamSubscriber ??= new Redis(
      env.REDIS_URL,
      STREAM_REDIS_OPTIONS,
    )),
  }));
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
  // The client is cached but the handle is not: the client holds the connection
  // pool and the TLS session, which a per-request instance would throw away and
  // renegotiate on every question asked. `DocumentIndex` itself is just a name
  // and a dimension over that client, so building one per call costs nothing
  // and keeps workspaces on different embedding models from sharing a handle.
  const client = (cache.search ??= createSearchClient(env));
  return new DocumentIndex(client, getIndexName(embeddingModel), dimension);
}
