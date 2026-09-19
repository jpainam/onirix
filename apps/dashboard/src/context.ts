import type { Context as ApiContext } from "@onirix/api/context";
import type { NextRequest } from "next/server";

import { env } from "./env.server";
import { auth, getDb, getDocumentIndex, getQueue, getSecrets } from "./services";

export async function createContext(req: NextRequest): Promise<ApiContext> {
  const session = await auth.api.getSession({ headers: req.headers });

  return {
    db: getDb(),
    session,
    queue: getQueue(),
    secrets: getSecrets(),
    getDocumentIndex,
    connectors: {
      allowPrivateNetworks: env.CONNECTOR_ALLOW_PRIVATE_NETWORKS,
      firecrawlApiKey: env.FIRECRAWL_API_KEY || null,
    },
    googleOAuth:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
