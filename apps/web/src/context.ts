import type { Context as ApiContext } from "@onirix/api/context";
import type { NextRequest } from "next/server";

import { auth, getDb, getDocumentIndex, getQueue } from "./services";

export async function createContext(req: NextRequest): Promise<ApiContext> {
  const session = await auth.api.getSession({ headers: req.headers });

  return {
    db: getDb(),
    session,
    queue: getQueue(),
    getDocumentIndex,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
