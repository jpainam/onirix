/**
 * Applies pending SQL migrations.
 *
 * Runs on worker startup so a fresh `docker compose up` provisions its own
 * schema. Uses drizzle-orm's programmatic migrator rather than the
 * `drizzle-kit migrate` CLI, which requires a TTY and so cannot run in a
 * container. Migrations are still generated with `drizzle-kit generate`.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import type { DatabaseConfig } from "./config";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(config: DatabaseConfig): Promise<void> {
  // Migrations run once at startup, so they get a dedicated single connection
  // rather than borrowing from the application pool.
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** Allows `node src/migrate.ts` as a standalone entrypoint. */
if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[db] DATABASE_URL is not set.");
    process.exit(1);
  }
  runMigrations({ DATABASE_URL: url })
    .then(() => {
      console.log("[db] schema up to date");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[db] migration failed:", error);
      process.exit(1);
    });
}
