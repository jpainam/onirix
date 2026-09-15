import type { createAuth } from "@onirix/auth";
import type { Database } from "@onirix/db";

export type Context = {
  auth: null;
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;
  db: Database;
};
