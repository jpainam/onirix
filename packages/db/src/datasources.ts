/**
 * Connected databases: which ones a caller may query.
 *
 * A database is a `source` row of type `postgres`. It indexes nothing, so the
 * columns about syncing mean something slightly different here: `status` is
 * whether the last connection attempt worked, `last_synced_at` is when the
 * schema was last read, and `default_visibility` with `source_default_team`
 * decides who may *query* it rather than who may read the documents it
 * produces. Reusing the source's audience model is the point: an admin who has
 * restricted a drive to a team restricts a database the same way, on the same
 * page, and the same rule is enforced.
 */
import { and, asc, eq } from "drizzle-orm";

import type {
  DatabaseQueryMode,
  DatabaseSchema,
  SavedQuery,
  SavedQueryParameter,
} from "@onirix/llm/database";
import { SAVED_QUERY_PARAMETER_TYPES } from "@onirix/llm/database";

import { resolveDocumentAcl } from "./access";
import type { Database } from "./index";
import type { SecretBox } from "./secrets";
import { savedQuery, source } from "./schema/knowledge";

/** What `source.config` holds for a `postgres` source. */
export type PostgresSourceConfig = {
  /**
   * The full connection string, secret included, in the clear. Never sent to
   * a client, and never written as-is: `sealPostgresConfig` is the only way a
   * config reaches the `jsonb` column, and it encrypts this field.
   */
  connectionUrl: string;
  /** What the data is, in the admin's words, for the model's catalogue. */
  description: string | null;
  /** Read at connect time and on demand; the model's picture of the database. */
  schema: DatabaseSchema;
  /** ISO timestamp of when `schema` was read. */
  introspectedAt: string;
  /**
   * Whether the model may write its own SQL. Absent on rows from before the
   * setting existed, which `readPostgresConfig` reads as the strict default.
   */
  mode: DatabaseQueryMode;
};

export type AccessibleDatabase = {
  id: string;
  name: string;
  config: PostgresSourceConfig;
  /** The admin-written queries, for a `saved` mode database. */
  savedQueries: SavedQuery[];
};

/**
 * The `postgres` sources in an organization that the holder of
 * `accessControlList` may query.
 *
 * Same rule as documents, applied to the source's default visibility:
 * organization-wide is open to every member, `teams` needs one of the source's
 * teams, and `private` — which makes sense for a document with an uploader and
 * not for a database — admits nobody. Admins are not exempt, as they are not
 * for documents: administering a connection is not the same as reading from it.
 */
export async function listAccessibleDatabases(
  db: Database,
  organizationId: string,
  accessControlList: readonly string[],
  secrets: SecretBox,
): Promise<AccessibleDatabase[]> {
  const rows = await db.query.source.findMany({
    where: and(eq(source.organizationId, organizationId), eq(source.type, "postgres")),
    with: { defaultTeams: true, savedQueries: { orderBy: asc(savedQuery.name) } },
    orderBy: (table, { asc }) => asc(table.name),
  });

  const held = new Set(accessControlList);

  return rows
    .filter((row) => {
      if (row.defaultVisibility === "organization") return true;
      const required = resolveDocumentAcl({
        visibility: row.defaultVisibility,
        teamIds: row.defaultTeams.map((entry) => entry.teamId),
        uploadedBy: null,
      });
      return required.some((token) => held.has(token));
    })
    .flatMap((row) => {
      const config = readPostgresConfig(row.config, secrets);
      // A row whose config does not parse is skipped rather than surfaced as a
      // database the model can name and then fail against every time.
      if (!config) return [];
      return [
        {
          id: row.id,
          name: row.name,
          config,
          savedQueries: row.savedQueries.map((entry) => ({
            name: entry.name,
            description: entry.description,
            sql: entry.sql,
            parameters: readSavedQueryParameters(entry.parameters),
          })),
        },
      ];
    });
}

/**
 * The form a config takes in the `jsonb` column: the same object with its one
 * secret sealed. Every write of `source.config` for a `postgres` source goes
 * through here, so a config read and written back never lands in the clear.
 */
export function sealPostgresConfig(
  config: PostgresSourceConfig,
  secrets: SecretBox,
): Record<string, unknown> {
  return { ...config, connectionUrl: secrets.seal(config.connectionUrl) };
}

/**
 * Validates a stored parameter list. A declaration with an unknown type is
 * dropped: binding it would guess, and the query is better off failing to find
 * its parameter than running with an unchecked value.
 */
export function readSavedQueryParameters(raw: unknown): SavedQueryParameter[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as { name?: unknown; type?: unknown; description?: unknown };
    if (typeof candidate.name !== "string" || candidate.name.length === 0) return [];
    if (
      typeof candidate.type !== "string" ||
      !(SAVED_QUERY_PARAMETER_TYPES as readonly string[]).includes(candidate.type)
    ) {
      return [];
    }
    return [
      {
        name: candidate.name,
        type: candidate.type as SavedQueryParameter["type"],
        description: typeof candidate.description === "string" ? candidate.description : null,
      },
    ];
  });
}

/**
 * Validates the `jsonb` column into the config the code expects.
 *
 * Structural rather than exhaustive: the schema inside is trusted to have been
 * written by `introspectPostgres`, and a broken one costs the model a bad table
 * list, not the process.
 */
export function readPostgresConfig(raw: unknown, secrets: SecretBox): PostgresSourceConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<PostgresSourceConfig>;
  if (typeof candidate.connectionUrl !== "string" || candidate.connectionUrl.length === 0) {
    return null;
  }
  const tables = (candidate.schema as { tables?: unknown } | undefined)?.tables;
  return {
    // Sealed on disk, opened here. A legacy plaintext value passes through
    // until `db:encrypt-secrets` rewrites it.
    connectionUrl: secrets.open(candidate.connectionUrl),
    description: typeof candidate.description === "string" ? candidate.description : null,
    schema: { tables: Array.isArray(tables) ? (tables as DatabaseSchema["tables"]) : [] },
    introspectedAt:
      typeof candidate.introspectedAt === "string" ? candidate.introspectedAt : "",
    // Strict unless an admin chose otherwise: a row from before the setting
    // existed was connected when every database took SQL, and tightening it is
    // the direction to err in.
    mode: candidate.mode === "adhoc" ? "adhoc" : "saved",
  };
}
