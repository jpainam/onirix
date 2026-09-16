/**
 * Answering from a connected database.
 *
 * A department's operational data lives in tables, not documents: enrolments,
 * invoices, tickets. Retrieval cannot answer "how many students registered
 * this year", so the model is given a way to ask the database itself.
 *
 * One tool serves every connected database. Which databases exist, and who may
 * see each, are rows in `source` — the model gets a catalogue of the ones the
 * caller may reach, and names one when it queries. Nothing here knows about
 * Postgres connections: this module owns the *contract* with the model (what
 * the tool accepts, what it returns, how a schema is described) and is handed
 * an executor for the actual round trip. That keeps `@onirix/llm` free of a
 * driver, so the client can type-import the tool shape without pulling one in.
 *
 * The same split as `skills.ts`: small always-on catalogue in the system
 * prompt, detail fetched on demand. A workspace with a hundred tables cannot
 * afford every column on every turn, so past a threshold the prompt lists table
 * names alone and the model reads columns with `describe_tables` first.
 */
import { tool } from "ai";
import { z } from "zod";

export const DATABASE_TOOL_NAME = "query_database";
export const DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
export const SAVED_QUERY_TOOL_NAME = "run_saved_query";

/**
 * How much of a database the model is allowed to ask.
 *
 * `saved` is the strict mode and the default: the model can only run queries an
 * admin wrote, with parameters bound server-side, so no SQL it writes ever
 * reaches the database. `adhoc` lets it write its own SELECTs, inside a
 * read-only transaction over a role verified to hold no write grant. The first
 * is for a system of record; the second for a database whose every row the
 * people asking are already allowed to read.
 */
export type DatabaseQueryMode = "saved" | "adhoc";

/**
 * The types a saved query's parameter may take.
 *
 * Kept to what a model can spell reliably and Postgres can bind unambiguously.
 * The model sends every value as text; the server coerces it to the declared
 * type before binding, so a `$1` typed `integer` never receives `'1; DROP'`.
 */
export const SAVED_QUERY_PARAMETER_TYPES = ["text", "integer", "number", "boolean", "date"] as const;
export type SavedQueryParameterType = (typeof SAVED_QUERY_PARAMETER_TYPES)[number];

export type SavedQueryParameter = {
  /** What the model writes; also the label an admin sees. */
  name: string;
  type: SavedQueryParameterType;
  description: string | null;
};

/**
 * A query an admin wrote for the model to call by name.
 *
 * The SQL uses `$1..$n` in the order of `parameters`. The model never sees the
 * SQL as something to edit — only the name, the description and the parameter
 * list, which is all it needs to call it.
 */
export type SavedQuery = {
  name: string;
  description: string;
  sql: string;
  parameters: SavedQueryParameter[];
};

/**
 * Rows a single query may return to the model.
 *
 * A model asked to read a thousand rows is being asked to do arithmetic it is
 * bad at; the prompt pushes it to aggregate in SQL instead. The cap protects
 * the context window when it does not listen.
 */
export const MAX_QUERY_ROWS = 200;

/** Characters kept of any single cell before it is cut. */
export const MAX_CELL_CHARS = 500;

/**
 * Past this many columns across a database, the system prompt stops inlining
 * column detail and lists tables alone.
 *
 * A small operational schema fits in a few hundred tokens and a turn that has
 * to call `describe_tables` first costs the reader a whole extra round trip. A
 * large one would cost more than that on every turn, whether or not the
 * question touches it.
 */
export const INLINE_SCHEMA_COLUMN_LIMIT = 400;

export type DatabaseColumn = {
  name: string;
  /** Postgres type as the model should read it: `integer`, `text`, `timestamp`. */
  type: string;
  nullable: boolean;
  /** Set for enum-typed columns. The model cannot guess a status value. */
  enumValues?: string[];
};

export type DatabaseForeignKey = {
  columns: string[];
  referencesTable: string;
  referencesColumns: string[];
};

export type DatabaseTable = {
  /** Postgres schema; `public` for most application databases. */
  schema: string;
  name: string;
  /** From the planner's statistics, so approximate and possibly null. */
  rowEstimate: number | null;
  columns: DatabaseColumn[];
  foreignKeys: DatabaseForeignKey[];
};

export type DatabaseSchema = {
  tables: DatabaseTable[];
};

/**
 * A database as the model sees it: a name to refer to it by and its shape.
 *
 * The connection itself stays with the executor. A name is what a model writes
 * into a tool argument, so it is the admin-chosen label rather than an id.
 */
export type ConnectedDatabase = {
  name: string;
  /** What the data is, in the admin's words. Helps the model pick a database. */
  description?: string | null;
  schema: DatabaseSchema;
  mode: DatabaseQueryMode;
  /** Consulted in `saved` mode only. */
  savedQueries: SavedQuery[];
};

/** A value in a returned cell, already flattened to what JSON can carry. */
export type QueryCell = string | number | boolean | null;

export type QueryResult = {
  columns: string[];
  rows: QueryCell[][];
  /** True when the query produced more rows than `MAX_QUERY_ROWS`. */
  truncated: boolean;
  durationMs: number;
};

/**
 * Runs one read-only statement against a named database.
 *
 * Provided by the caller. It is expected to enforce the read-only guarantee
 * itself, since the model's SQL is untrusted, and to throw on failure with a
 * message worth showing the model.
 */
export type QueryExecutor = (
  database: ConnectedDatabase,
  sql: string,
  /** Bound as `$1..$n`. Only a saved query ever has any. */
  values?: readonly (string | number | boolean | null)[],
) => Promise<QueryResult>;

/**
 * What a `query_database` call returns, and therefore what the client renders
 * and what a stored turn has to restore. Validated on restore because the
 * column is `jsonb` and nothing else vouches for it.
 */
const boundParameterSchema = z.object({ name: z.string(), value: z.string() });

export const databaseQueryOutputSchema = z.union([
  z.object({
    database: z.string(),
    sql: z.string(),
    /** Set when the rows came from a saved query rather than the model's SQL. */
    query: z.string().optional(),
    parameters: z.array(boundParameterSchema).optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    rowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    database: z.string(),
    sql: z.string(),
    query: z.string().optional(),
    parameters: z.array(boundParameterSchema).optional(),
    error: z.string(),
  }),
]);

export type DatabaseQueryOutput = z.infer<typeof databaseQueryOutputSchema>;

export const databaseQueryInputSchema = z.object({
  database: z.string().describe("The database's name, exactly as listed."),
  /**
   * Shown to the reader above the result, so it is written for them: "Students
   * enrolled in 2025-2026", not "count query".
   */
  purpose: z
    .string()
    .min(1)
    .max(160)
    .describe("One short line, for the reader, saying what this query answers."),
  sql: z.string().min(1).describe("A single SELECT statement. Postgres dialect."),
});

export type DatabaseQueryInput = z.infer<typeof databaseQueryInputSchema>;

/**
 * Quotes an identifier the way the model must write it.
 *
 * Postgres folds unquoted names to lower case, and application schemas built
 * with an ORM are full of `schoolYearId` and `"Enrollment"`. A model that reads
 * `Enrollment` in the prompt and writes `FROM Enrollment` gets "relation does
 * not exist" — so the prompt shows every name already in the form a query needs.
 */
export function quoteIdentifier(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
}

function tableReference(table: Pick<DatabaseTable, "schema" | "name">): string {
  return table.schema === "public"
    ? quoteIdentifier(table.name)
    : `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
}

function formatRowEstimate(estimate: number | null): string {
  if (estimate === null || estimate < 0) return "";
  if (estimate < 1000) return ` (~${Math.round(estimate)} rows)`;
  return ` (~${Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(estimate)} rows)`;
}

/** One table, every column, on a few lines. What `describe_tables` returns. */
export function renderTableDetails(table: DatabaseTable): string {
  const references = new Map<string, DatabaseForeignKey>();
  for (const key of table.foreignKeys) {
    const [first] = key.columns;
    if (first && key.columns.length === 1) references.set(first, key);
  }

  const columns = table.columns.map((column) => {
    const parts = [`${quoteIdentifier(column.name)} ${column.type}`];
    if (!column.nullable) parts.push("not null");
    if (column.enumValues && column.enumValues.length > 0) {
      parts.push(`one of: ${column.enumValues.map((value) => `'${value}'`).join(", ")}`);
    }
    const key = references.get(column.name);
    if (key) {
      const target = key.referencesColumns.map(quoteIdentifier).join(", ");
      parts.push(`references ${quoteIdentifier(key.referencesTable)}(${target})`);
    }
    return `  ${parts.join(", ")}`;
  });

  const composite = table.foreignKeys
    .filter((key) => key.columns.length > 1)
    .map(
      (key) =>
        `  (${key.columns.map(quoteIdentifier).join(", ")}) references ${quoteIdentifier(
          key.referencesTable,
        )}(${key.referencesColumns.map(quoteIdentifier).join(", ")})`,
    );

  return [
    `${tableReference(table)}${formatRowEstimate(table.rowEstimate)}`,
    ...columns,
    ...composite,
  ].join("\n");
}

function countColumns(schema: DatabaseSchema): number {
  return schema.tables.reduce((total, table) => total + table.columns.length, 0);
}

/**
 * The always-on description of one database.
 *
 * Full detail when the schema is small enough to afford; table names and row
 * counts alone when it is not, with a pointer to `describe_tables`.
 */
function renderDatabaseOverview(database: ConnectedDatabase): string {
  const heading = `## ${database.name}`;
  const description = database.description?.trim() ? database.description.trim() : "";

  if (database.mode === "saved") {
    const listed = database.savedQueries.map(renderSavedQuerySignature).join("\n");
    return [
      heading,
      description,
      `Saved queries only. This database answers through the queries below, called \
with \`${SAVED_QUERY_TOOL_NAME}\`; you cannot write SQL against it. If no query fits \
the question, say so and name the query that would be needed.`,
      listed || "No saved queries have been defined yet.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const { tables } = database.schema;

  if (tables.length === 0) {
    return [heading, description, "This database has no tables."].filter(Boolean).join("\n");
  }

  if (countColumns(database.schema) <= INLINE_SCHEMA_COLUMN_LIMIT) {
    return [heading, description, ...tables.map(renderTableDetails)]
      .filter(Boolean)
      .join("\n\n");
  }

  const listed = tables
    .map((table) => `${tableReference(table)}${formatRowEstimate(table.rowEstimate)}`)
    .join(", ");

  return [
    heading,
    description,
    `${tables.length} tables. Call \`${DESCRIBE_TABLES_TOOL_NAME}\` for the columns of \
the ones a question needs before writing SQL against them.`,
    `Tables: ${listed}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The system prompt section that makes the databases reachable.
 *
 * Empty when the caller can reach none, so the prompt never advertises a tool
 * there is no reason to call.
 */
export function buildDatabaseSection(databases: readonly ConnectedDatabase[]): string {
  if (databases.length === 0) return "";

  const overviews = databases.map(renderDatabaseOverview).join("\n\n");

  return `# Databases
Besides documents, you can answer with live data from the PostgreSQL databases \
below by calling \`${DATABASE_TOOL_NAME}\` with the database's name and one SELECT \
statement. Use them when a question asks for counts, totals, lists or trends that \
live in records rather than prose.

Rules:
- A database marked "saved queries only" is reached with \`${SAVED_QUERY_TOOL_NAME}\` \
and nothing else. The others take one SELECT per call in standard PostgreSQL; no \
writes, no DDL, no transaction control. Every connection is read-only regardless.
- Identifiers are case-sensitive. Quote every table and column name exactly as \
listed here, e.g. ${quoteIdentifier("Enrollment")}.${quoteIdentifier("schoolYearId")}. Never guess a \
name that is not listed; describe the table first.
- Results are capped at ${MAX_QUERY_ROWS} rows. Aggregate, filter and sort in SQL rather \
than fetching rows to count them yourself.
- Read the result before answering. If the query fails, fix it once from the \
error message; if it fails again, tell the reader what could not be answered.
- Say which database a figure came from. A queried figure needs no \`[n]\` \
citation: the reader sees the query and its result beside your answer. Do not \
cite a document for a number that came from a query.
- Rows from a query may be plotted with \`render_chart\`; leave the series' \
\`citation\` unset in that case.

${overviews}`;
}

/**
 * Builds the tool that runs a query against one of the caller's databases.
 *
 * A factory because the databases are the caller's: which ones exist, and their
 * schemas, are captured here so the model cannot name one it was not shown.
 */
export function createQueryDatabaseTool(
  databases: readonly ConnectedDatabase[],
  execute: QueryExecutor,
) {
  // Only the databases that allow model-written SQL. A saved-mode database is
  // unknown to this tool, so naming it here fails the same way a typo does.
  const adhoc = databases.filter((entry) => entry.mode === "adhoc");
  const byName = new Map(adhoc.map((entry) => [entry.name, entry]));
  const available = adhoc.map((entry) => entry.name);

  return tool({
    description: [
      "Run one read-only SELECT against a connected PostgreSQL database listed in",
      "the system prompt, and get its rows back. Use it for counts, totals, lists",
      "and trends held in records. Quote identifiers exactly as listed.",
    ].join(" "),
    inputSchema: databaseQueryInputSchema,
    execute: async ({ database: name, sql }): Promise<DatabaseQueryOutput> => {
      const found = byName.get(name);
      if (!found) {
        // Returned, not thrown, for the same reason as `load_skill`: a tool
        // error invites a retry loop that spends the whole step budget.
        return {
          database: name,
          sql,
          error:
            `No database named "${name}".` +
            (available.length > 0
              ? ` Databases that take SQL: ${available.join(", ")}.`
              : " No connected database takes SQL; use the saved queries."),
        };
      }

      try {
        const result = await execute(found, sql);
        return {
          database: found.name,
          sql,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rows.length,
          truncated: result.truncated,
          durationMs: result.durationMs,
        };
      } catch (error) {
        return {
          database: found.name,
          sql,
          error: error instanceof Error ? error.message : "The query failed.",
        };
      }
    },
  });
}

export const describeTablesInputSchema = z.object({
  database: z.string().describe("The database's name, exactly as listed."),
  tables: z
    .array(z.string().min(1))
    .min(1)
    .max(12)
    .describe("Table names exactly as listed, without quotes. At most 12."),
});

/**
 * Builds the tool that reads column detail for a few tables.
 *
 * Pure lookup against the introspected schema captured at connect time; no
 * database round trip happens here, so it is cheap to call mid-stream.
 */
export function createDescribeTablesTool(databases: readonly ConnectedDatabase[]) {
  const byName = new Map(
    databases.filter((entry) => entry.mode === "adhoc").map((entry) => [entry.name, entry]),
  );

  return tool({
    description: [
      "Read the columns, types, enum values and foreign keys of up to 12 tables",
      "in a connected database, before writing SQL against them. Table names",
      "must match the system prompt's list exactly.",
    ].join(" "),
    inputSchema: describeTablesInputSchema,
    execute: async ({ database: name, tables }) => {
      const found = byName.get(name);
      if (!found) {
        return { error: `No database named "${name}".` };
      }

      const wanted = new Set(tables.map((table) => table.replaceAll('"', "")));
      const matched = found.schema.tables.filter(
        (table) => wanted.has(table.name) || wanted.has(`${table.schema}.${table.name}`),
      );
      const missing = [...wanted].filter(
        (table) =>
          !matched.some((entry) => entry.name === table || `${entry.schema}.${entry.name}` === table),
      );

      return {
        database: found.name,
        tables: matched.map(renderTableDetails).join("\n\n"),
        ...(missing.length > 0 ? { missing } : {}),
      };
    },
  });
}

/** `students_enrolled(school_year: text) — Students enrolled in a school year.` */
function renderSavedQuerySignature(query: SavedQuery): string {
  const parameters = query.parameters
    .map((parameter) =>
      `${parameter.name}: ${parameter.type}${parameter.description ? ` (${parameter.description})` : ""}`,
    )
    .join(", ");
  return `- ${query.name}(${parameters}) — ${query.description}`;
}

/** The highest `$n` a statement refers to; 0 when it takes no parameters. */
export function countPlaceholders(sql: string): number {
  let highest = 0;
  for (const match of sql.matchAll(/\$(\d+)/g)) {
    const index = Number.parseInt(match[1] ?? "0", 10);
    if (index > highest) highest = index;
  }
  return highest;
}

export type BoundValue = string | number | boolean | null;

/**
 * Turns the model's text values into typed values for `$1..$n`.
 *
 * Coercion is the enforcement: a parameter declared `integer` reaches the
 * database as a number or not at all, and a `date` as a validated ISO date.
 * The SQL itself is the admin's and never changes, so what the model controls
 * is exactly the set of values a prepared statement would accept from anyone.
 *
 * Returns an error string rather than throwing, for the model to read.
 */
export function bindSavedQueryParameters(
  query: SavedQuery,
  supplied: readonly { name: string; value: string }[],
): { values: BoundValue[] } | { error: string } {
  const byName = new Map(supplied.map((entry) => [entry.name, entry.value]));
  const unknown = supplied
    .map((entry) => entry.name)
    .filter((name) => !query.parameters.some((parameter) => parameter.name === name));
  if (unknown.length > 0) {
    return {
      error: `"${query.name}" has no parameter named ${unknown.map((name) => `"${name}"`).join(", ")}. It takes: ${
        query.parameters.map((parameter) => parameter.name).join(", ") || "no parameters"
      }.`,
    };
  }

  const values: BoundValue[] = [];
  for (const parameter of query.parameters) {
    const raw = byName.get(parameter.name);
    if (raw === undefined) {
      return { error: `"${query.name}" needs a value for "${parameter.name}" (${parameter.type}).` };
    }
    const coerced = coerceParameter(raw, parameter.type);
    if (coerced === undefined) {
      return {
        error: `"${parameter.name}" must be ${describeType(parameter.type)}; got "${raw}".`,
      };
    }
    values.push(coerced);
  }
  return { values };
}

function coerceParameter(raw: string, type: SavedQueryParameterType): BoundValue | undefined {
  const value = raw.trim();
  switch (type) {
    case "text":
      return raw;
    case "integer": {
      if (!/^-?\d+$/.test(value)) return undefined;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(value)) return undefined;
      return Number(value);
    }
    case "boolean":
      if (/^(true|yes|1)$/i.test(value)) return true;
      if (/^(false|no|0)$/i.test(value)) return false;
      return undefined;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
      return Number.isNaN(Date.parse(value)) ? undefined : value;
  }
}

function describeType(type: SavedQueryParameterType): string {
  switch (type) {
    case "text":
      return "text";
    case "integer":
      return "a whole number";
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "date":
      return "a date written YYYY-MM-DD";
  }
}

export const savedQueryInputSchema = z.object({
  database: z.string().describe("The database's name, exactly as listed."),
  query: z.string().describe("The saved query's name, exactly as listed."),
  purpose: z
    .string()
    .min(1)
    .max(160)
    .describe("One short line, for the reader, saying what this answers."),
  // Pairs rather than a record: a record compiles to `additionalProperties`,
  // which some providers' strict tool schemas reject. Every value is text and
  // is coerced to the parameter's declared type on the server.
  parameters: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .default([])
    .describe("One entry per parameter the query declares, values as text."),
});

export type SavedQueryInput = z.infer<typeof savedQueryInputSchema>;

/**
 * Builds the tool that runs an admin-written query by name.
 *
 * The strict counterpart of `createQueryDatabaseTool`: the model chooses which
 * query and supplies values, and that is the whole of its influence. The SQL
 * that runs is the stored text, with the values bound as parameters.
 */
export function createRunSavedQueryTool(
  databases: readonly ConnectedDatabase[],
  execute: QueryExecutor,
) {
  const byName = new Map(
    databases.filter((entry) => entry.mode === "saved").map((entry) => [entry.name, entry]),
  );

  return tool({
    description: [
      "Run one of the saved queries listed for a database marked 'saved queries",
      "only' in the system prompt, supplying its parameters as text. This is the",
      "only way to read from such a database.",
    ].join(" "),
    inputSchema: savedQueryInputSchema,
    execute: async ({ database: name, query: queryName, parameters }): Promise<DatabaseQueryOutput> => {
      const found = byName.get(name);
      if (!found) {
        return {
          database: name,
          sql: "",
          query: queryName,
          error:
            `No saved-query database named "${name}".` +
            (byName.size > 0 ? ` Available: ${[...byName.keys()].join(", ")}.` : ""),
        };
      }
      const query = found.savedQueries.find((entry) => entry.name === queryName);
      if (!query) {
        return {
          database: found.name,
          sql: "",
          query: queryName,
          error:
            `"${found.name}" has no saved query named "${queryName}".` +
            (found.savedQueries.length > 0
              ? ` Available: ${found.savedQueries.map((entry) => entry.name).join(", ")}.`
              : " It has no saved queries."),
        };
      }

      const bound = bindSavedQueryParameters(query, parameters);
      if ("error" in bound) {
        return { database: found.name, sql: query.sql, query: query.name, parameters, error: bound.error };
      }

      try {
        const result = await execute(found, query.sql, bound.values);
        return {
          database: found.name,
          sql: query.sql,
          query: query.name,
          parameters,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rows.length,
          truncated: result.truncated,
          durationMs: result.durationMs,
        };
      } catch (error) {
        return {
          database: found.name,
          sql: query.sql,
          query: query.name,
          parameters,
          error: error instanceof Error ? error.message : "The query failed.",
        };
      }
    },
  });
}
