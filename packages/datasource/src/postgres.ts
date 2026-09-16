/**
 * The Postgres side of a connected database: reading its shape, and running the
 * model's SQL against it without letting that SQL do anything but read.
 *
 * Two guarantees, and the second does not rely on the first:
 *
 *   1. The statement is wrapped as a subquery with a row cap. Anything that is
 *      not a single SELECT — a second statement, an UPDATE, a COPY — is a
 *      syntax error inside `SELECT * FROM (...) LIMIT n`, and never reaches the
 *      planner as itself.
 *   2. It runs inside a `READ ONLY` transaction with a statement timeout, and
 *      that transaction is always rolled back. A statement that somehow got
 *      past the wrapper still cannot write, and cannot run forever.
 *
 * The admin is asked to connect with a read-only role as well. Three layers,
 * because the SQL is written by a model from a question typed by anyone in the
 * organization, and the database is someone's system of record.
 */
import pg from "pg";

import type {
  BoundValue,
  ConnectedDatabase,
  DatabaseColumn,
  DatabaseForeignKey,
  DatabaseSchema,
  DatabaseTable,
  QueryCell,
  QueryResult,
} from "@onirix/llm/database";
import { MAX_CELL_CHARS, MAX_QUERY_ROWS } from "@onirix/llm/database";

/** A model's query is short by construction; one that is not is a mistake. */
const STATEMENT_TIMEOUT_MS = 15_000;
/** Time allowed to reach the database before the attempt is reported as failed. */
const CONNECT_TIMEOUT_MS = 5_000;
/** Tables past this are dropped from the schema the model sees. */
const MAX_TABLES = 400;

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/**
 * Pools, one per connection string, kept for the life of the process.
 *
 * On `globalThis` for the same reason the app's own services are: Next.js
 * re-evaluates modules on hot reload, and a pool per reload exhausts the
 * remote database's connection slots in an afternoon of development.
 */
type PoolCache = Map<string, pg.Pool>;
const pools: PoolCache = ((globalThis as { __onirixDatasourcePools?: PoolCache })
  .__onirixDatasourcePools ??= new Map());

/**
 * `int8` arrives from the driver as a string, so a `count(*)` would reach the
 * model as `"2754"`. Parsed to a number where that loses nothing; left as text
 * past 2^53, where it would. Set per pool rather than on the driver's global
 * type registry, which the application's own Drizzle connection shares.
 */
const cellTypes: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: "text" | "binary") => {
    if (oid === 20 && format !== "binary") {
      return (value: string) => {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) ? parsed : value;
      };
    }
    return format === "binary"
      ? pg.types.getTypeParser(oid, format)
      : pg.types.getTypeParser(oid);
  }) as pg.CustomTypesConfig["getTypeParser"],
};

function getPool(connectionUrl: string): pg.Pool {
  let pool = pools.get(connectionUrl);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: connectionUrl,
      // Two, not ten: a chat turn runs one query at a time, and the database
      // belongs to a department that has its own application to serve.
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      allowExitOnIdle: true,
      types: cellTypes,
      application_name: "onirix",
    });
    // A pool that loses a connection emits an error event; left unhandled it
    // takes the process down. The next query gets a fresh connection anyway.
    pool.on("error", (error) => {
      console.error("Datasource pool error", error);
    });
    pools.set(connectionUrl, pool);
  }
  return pool;
}

/** Drops the pool for a connection that is no longer configured. */
export async function closeDatabasePool(connectionUrl: string): Promise<void> {
  const pool = pools.get(connectionUrl);
  if (!pool) return;
  pools.delete(connectionUrl);
  await pool.end().catch(() => {});
}

/**
 * The connection string without its secret, for a list an admin reads.
 *
 * Null when the URL does not parse, in which case the caller has nothing safe
 * to show and shows nothing.
 */
export function describeConnection(
  connectionUrl: string,
): { host: string; port: string | null; database: string; user: string | null } | null {
  try {
    const url = new URL(connectionUrl);
    return {
      host: url.hostname,
      port: url.port || null,
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      user: url.username ? decodeURIComponent(url.username) : null,
    };
  } catch {
    return null;
  }
}

/** A failure the model or the admin can act on, as opposed to a driver's stack. */
export class DatabaseQueryError extends Error {}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    // Postgres error codes are five characters; the driver's own (`ECONNREFUSED`,
    // `ETIMEDOUT`) say more than the message they come with.
    if (typeof code === "string" && !/^[0-9A-Z]{5}$/.test(code)) {
      return `${code}: ${error.message}`;
    }
    const position = (error as { position?: unknown }).position;
    const hint = (error as { hint?: unknown }).hint;
    return [
      error.message,
      typeof position === "string" ? `(at character ${position})` : "",
      typeof hint === "string" ? `Hint: ${hint}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "The database returned an error.";
}

/**
 * Reads the shape of a database: tables, columns, enum values, foreign keys.
 *
 * Also the connection test. If this succeeds the database is reachable and the
 * credentials work, which is what an admin pressing "Connect" wants to know.
 */
export async function introspectPostgres(connectionUrl: string): Promise<DatabaseSchema> {
  const pool = getPool(connectionUrl);
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw new DatabaseQueryError(`Could not connect: ${describeError(error)}`);
  }

  try {
    // Sequential: one client runs one query at a time, and the driver drops
    // support for overlapping calls in its next major version.
    const tables = await client.query<{ schema: string; name: string; row_estimate: string | null }>(
      `SELECT n.nspname AS schema, c.relname AS name,
                CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples END AS row_estimate
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p', 'v', 'm')
            AND n.nspname <> ALL($1::text[])
            AND n.nspname NOT LIKE 'pg_%'
          ORDER BY n.nspname, c.relname`,
      [SYSTEM_SCHEMAS],
    );
    const columns = await client.query<{
      schema: string;
      table: string;
      name: string;
      data_type: string;
      udt_name: string;
      nullable: "YES" | "NO";
    }>(
      `SELECT table_schema AS schema, table_name AS "table", column_name AS name,
                data_type, udt_name, is_nullable AS nullable
           FROM information_schema.columns
          WHERE table_schema <> ALL($1::text[])
            AND table_schema NOT LIKE 'pg_%'
          ORDER BY table_schema, table_name, ordinal_position`,
      [SYSTEM_SCHEMAS],
    );
    const enums = await client.query<{ type: string; value: string }>(
      `SELECT t.typname AS type, e.enumlabel AS value
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          ORDER BY t.typname, e.enumsortorder`,
    );
    const foreignKeys = await client.query<{
      schema: string;
      table: string;
      columns: string[];
      ref_schema: string;
      ref_table: string;
      ref_columns: string[];
    }>(
      `SELECT ns.nspname AS schema, cl.relname AS "table",
                array_agg(a.attname::text ORDER BY u.ord) AS columns,
                fns.nspname AS ref_schema, fcl.relname AS ref_table,
                array_agg(fa.attname::text ORDER BY u.ord) AS ref_columns
           FROM pg_constraint con
           JOIN pg_class cl ON cl.oid = con.conrelid
           JOIN pg_namespace ns ON ns.oid = cl.relnamespace
           JOIN pg_class fcl ON fcl.oid = con.confrelid
           JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
          CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS u(attnum, fattnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum
           JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = u.fattnum
          WHERE con.contype = 'f'
          GROUP BY con.oid, ns.nspname, cl.relname, fns.nspname, fcl.relname
          ORDER BY ns.nspname, cl.relname`,
    );

    const enumValues = new Map<string, string[]>();
    for (const row of enums.rows) {
      const values = enumValues.get(row.type) ?? [];
      values.push(row.value);
      enumValues.set(row.type, values);
    }

    const columnsByTable = new Map<string, DatabaseColumn[]>();
    for (const row of columns.rows) {
      const key = `${row.schema}.${row.table}`;
      const list = columnsByTable.get(key) ?? [];
      const values = enumValues.get(row.udt_name);
      list.push({
        name: row.name,
        type: readableType(row.data_type, row.udt_name),
        nullable: row.nullable === "YES",
        ...(values ? { enumValues: values } : {}),
      });
      columnsByTable.set(key, list);
    }

    const keysByTable = new Map<string, DatabaseForeignKey[]>();
    for (const row of foreignKeys.rows) {
      const key = `${row.schema}.${row.table}`;
      const list = keysByTable.get(key) ?? [];
      list.push({
        columns: row.columns,
        referencesTable:
          row.ref_schema === "public" ? row.ref_table : `${row.ref_schema}.${row.ref_table}`,
        referencesColumns: row.ref_columns,
      });
      keysByTable.set(key, list);
    }

    const result: DatabaseTable[] = tables.rows.slice(0, MAX_TABLES).map((row) => ({
      schema: row.schema,
      name: row.name,
      rowEstimate: row.row_estimate === null ? null : Number(row.row_estimate),
      columns: columnsByTable.get(`${row.schema}.${row.name}`) ?? [],
      foreignKeys: keysByTable.get(`${row.schema}.${row.name}`) ?? [],
    }));

    return { tables: result };
  } catch (error) {
    throw new DatabaseQueryError(`Could not read the schema: ${describeError(error)}`);
  } finally {
    client.release();
  }
}

/**
 * `information_schema` says `USER-DEFINED` for an enum and `ARRAY` for any
 * array; `udt_name` has the real name, with a leading underscore for arrays.
 */
function readableType(dataType: string, udtName: string): string {
  if (dataType === "ARRAY") return `${udtName.replace(/^_/, "")}[]`;
  if (dataType === "USER-DEFINED") return udtName;
  if (dataType === "character varying") return "varchar";
  if (dataType === "timestamp without time zone") return "timestamp";
  if (dataType === "timestamp with time zone") return "timestamptz";
  if (dataType === "double precision") return "float8";
  return dataType;
}

/**
 * Runs the model's statement and returns its rows, flattened for JSON.
 *
 * Throws `DatabaseQueryError` with a message written for the model: it is what
 * the model will read when deciding how to fix the query.
 */
export async function runReadOnlyQuery(
  connectionUrl: string,
  sql: string,
  options: { maxRows?: number; values?: readonly BoundValue[] } = {},
): Promise<QueryResult> {
  const maxRows = options.maxRows ?? MAX_QUERY_ROWS;
  const statement = prepareStatement(sql, maxRows);

  const pool = getPool(connectionUrl);
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw new DatabaseQueryError(`Could not connect: ${describeError(error)}`);
  }

  const started = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    // Array mode: rows as arrays are compact on the wire to the model, and
    // duplicate column names (two `id`s from a join) survive instead of one
    // silently overwriting the other in an object.
    // Values, when there are any, go through the extended protocol as bound
    // parameters: they are never spliced into the text, and the protocol
    // itself refuses more than one statement.
    const result = await client.query({
      text: statement,
      values: options.values ? [...options.values] : undefined,
      rowMode: "array",
    });

    const truncated = result.rows.length > maxRows;
    const rows = (truncated ? result.rows.slice(0, maxRows) : result.rows) as unknown[][];

    return {
      columns: result.fields.map((field) => field.name),
      rows: rows.map((row) => row.map(flattenCell)),
      truncated,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    throw new DatabaseQueryError(describeError(error));
  } finally {
    // Always. A read-only transaction has nothing to commit, and a client
    // handed back mid-transaction poisons the next borrower.
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

/**
 * Wraps the model's SQL so it can only ever be one SELECT with a row cap.
 *
 * A trailing semicolon is tolerated because models write them; an inner one is
 * refused because it is how a second statement would arrive. A closing
 * newline before the parenthesis keeps a trailing `-- comment` from swallowing
 * the wrapper.
 */
export function prepareStatement(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "").trim();
  if (trimmed.length === 0) {
    throw new DatabaseQueryError("The query is empty.");
  }
  if (trimmed.includes(";")) {
    throw new DatabaseQueryError("Send one statement at a time, without semicolons.");
  }
  // One more than the cap, so the caller can tell "exactly the cap" from
  // "more than the cap" and say so to the model.
  return `SELECT * FROM (\n${trimmed}\n) AS onirix_query LIMIT ${maxRows + 1}`;
}

/**
 * What a cell becomes on its way to the model and the reader.
 *
 * Dates as ISO strings, so a `timestamp` reads the same everywhere; anything
 * structured as JSON text; long text cut, because a `description` column
 * holding a page of prose per row is not what a question about counts wants.
 */
function flattenCell(value: unknown): QueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return clip(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Buffer.isBuffer(value)) return `<${value.byteLength} bytes>`;
  try {
    return clip(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function clip(text: string): string {
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
}

/**
 * The executor `createQueryDatabaseTool` wants, over databases whose connection
 * strings the caller has already resolved.
 */
export function createPostgresExecutor(
  connections: ReadonlyMap<string, string>,
): (
  database: ConnectedDatabase,
  sql: string,
  values?: readonly BoundValue[],
) => Promise<QueryResult> {
  return async (database, sql, values) => {
    const connectionUrl = connections.get(database.name);
    if (!connectionUrl) {
      throw new DatabaseQueryError(`"${database.name}" has no connection configured.`);
    }
    return runReadOnlyQuery(connectionUrl, sql, { values });
  };
}

/**
 * What connecting checks about the role before a database is accepted.
 *
 * `problems` empty means the role can read and cannot write, as far as the
 * catalogue can tell. Anything listed is a reason to refuse the connection: a
 * role that can write is one prompt-injection away from writing, whatever the
 * transaction says, and a superuser can end the read-only transaction itself.
 */
export type RoleVerification = {
  role: string;
  problems: string[];
};

/** Tables shown by name in a refusal before the rest are counted. */
const NAMED_PROBLEMS = 5;

/**
 * Checks that the connected role is one Onirix is willing to hand a model.
 *
 * The transaction and the subquery wrapper are the working guards; this is the
 * guarantee underneath them. It refuses superusers, roles that can bypass row
 * security, any INSERT/UPDATE/DELETE/TRUNCATE grant on any user table, CREATE
 * on any schema, membership in the server-file roles, and the two extensions
 * that open a second connection from inside a query.
 */
export async function verifyReadOnlyRole(connectionUrl: string): Promise<RoleVerification> {
  const pool = getPool(connectionUrl);
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw new DatabaseQueryError(`Could not connect: ${describeError(error)}`);
  }

  try {
    const problems: string[] = [];

    const role = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
         FROM pg_roles WHERE rolname = current_user`,
    );
    const me = role.rows[0];
    if (!me) throw new DatabaseQueryError("Could not read the connected role.");
    if (me.rolsuper) problems.push("the role is a superuser");
    if (me.rolbypassrls) problems.push("the role bypasses row-level security");
    if (me.rolcreaterole) problems.push("the role can create roles");
    if (me.rolcreatedb) problems.push("the role can create databases");

    const writable = await client.query<{ table: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS "table"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND n.nspname <> ALL($1::text[])
          AND n.nspname NOT LIKE 'pg_%'
          AND (has_table_privilege(c.oid, 'INSERT')
            OR has_table_privilege(c.oid, 'UPDATE')
            OR has_table_privilege(c.oid, 'DELETE')
            OR has_table_privilege(c.oid, 'TRUNCATE'))
        ORDER BY 1`,
      [SYSTEM_SCHEMAS],
    );
    if (writable.rows.length > 0) {
      const named = writable.rows.slice(0, NAMED_PROBLEMS).map((row) => row.table);
      const more = writable.rows.length - named.length;
      problems.push(
        `the role can write to ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`,
      );
    }

    const creatable = await client.query<{ schema: string }>(
      `SELECT nspname AS schema FROM pg_namespace
        WHERE nspname <> ALL($1::text[]) AND nspname NOT LIKE 'pg_%'
          AND has_schema_privilege(oid, 'CREATE')
        ORDER BY 1`,
      [SYSTEM_SCHEMAS],
    );
    if (creatable.rows.length > 0) {
      problems.push(
        `the role can create objects in schema ${creatable.rows.map((row) => row.schema).join(", ")}`,
      );
    }

    const serverRoles = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles
        WHERE rolname IN ('pg_write_server_files', 'pg_read_server_files', 'pg_execute_server_program')
          AND pg_has_role(current_user, oid, 'MEMBER')`,
    );
    for (const row of serverRoles.rows) {
      problems.push(`the role is a member of ${row.rolname}`);
    }

    const extensions = await client.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname IN ('dblink', 'postgres_fdw')`,
    );
    for (const row of extensions.rows) {
      // Either lets a query open a second connection that the read-only
      // transaction does not cover. Installed is enough to refuse: whether the
      // role may use it today is one GRANT away from changing.
      problems.push(`the ${row.extname} extension is installed`);
    }

    return { role: me.rolname, problems };
  } catch (error) {
    if (error instanceof DatabaseQueryError) throw error;
    throw new DatabaseQueryError(`Could not verify the role: ${describeError(error)}`);
  } finally {
    client.release();
  }
}

/** The refusal an admin reads when verification fails. */
export function describeRoleProblems(verification: RoleVerification): string {
  return (
    `Onirix only connects with a read-only role, and "${verification.role}" is not one: ` +
    `${verification.problems.join("; ")}. Create a role with CONNECT, USAGE on the schema ` +
    `and SELECT on the tables it may read, and connect with that.`
  );
}
