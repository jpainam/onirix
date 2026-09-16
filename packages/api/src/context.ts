import type { createAuth } from "@onirix/auth";
import type { Database } from "@onirix/db";
import type { SecretBox } from "@onirix/db/secrets";
import type { DocumentIndex } from "@onirix/search";
import type { Redis } from "ioredis";

export type Session = Awaited<
  ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>
>;

export type Context = {
  db: Database;
  session: Session;
  queue: Redis;
  /** Seals credentials on the way into the database and opens them on the way out. */
  secrets: SecretBox;
  /** Built per-request from the workspace's embedding configuration. */
  getDocumentIndex: (embeddingModel: string, dimension: number) => DocumentIndex;
};
