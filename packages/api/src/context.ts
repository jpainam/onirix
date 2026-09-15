import type { createAuth } from "@onirix/auth";
import type { Database } from "@onirix/db";
import type { DocumentIndex } from "@onirix/search";
import type { Redis } from "ioredis";

export type Session = Awaited<
  ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>
>;

export type Context = {
  db: Database;
  /** Deployment environment, consulted for server-provided model keys. */
  env: Record<string, string | undefined>;
  session: Session;
  queue: Redis;
  /** Built per-request from the workspace's embedding configuration. */
  getDocumentIndex: (embeddingModel: string, dimension: number) => DocumentIndex;
};
