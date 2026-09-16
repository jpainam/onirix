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
  /** Deployment policy for connectors that fetch by address. */
  connectors: {
    /** Let a website source read private and loopback addresses. Off unless the deployment is an intranet. */
    allowPrivateNetworks: boolean;
    /** Firecrawl key for browser-rendered website sources. Null when the deployment has none. */
    firecrawlApiKey: string | null;
  };
  /**
   * The deployment's Google OAuth app, when one is configured. A Drive source
   * that reads through a linked Google account refreshes its token with these.
   */
  googleOAuth: { clientId: string; clientSecret: string } | null;
};
