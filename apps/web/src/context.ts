import type { Context as ApiContext } from "@onirix/api/context";
import type { NextRequest } from "next/server";

import { getDb } from "./services";
import { auth } from "./services";

export async function createContext(req: NextRequest): Promise<ApiContext> {
  const db = await getDb();
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    auth: null,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
