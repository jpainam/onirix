/**
 * Connected databases, as the Sources page manages them.
 *
 * A database is a `source` of type `postgres`. Connecting one reads its schema,
 * which doubles as the connection test; the schema is stored on the row so
 * answering never introspects. Who may query it is the source's default
 * visibility, changed through `knowledge.setSourceDefaultVisibility` like any
 * other source's.
 *
 * The connection string is the one secret here. It goes in on `connect`, is
 * used on the server, and never comes back out: `list` returns the host and
 * database name it parses to, and nothing more.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  closeDatabasePool,
  describeConnection,
  describeRoleProblems,
  introspectPostgres,
  runReadOnlyQuery,
  verifyReadOnlyRole,
} from "@onirix/datasource";
import type { Database } from "@onirix/db";
import {
  readPostgresConfig,
  readSavedQueryParameters,
  sealPostgresConfig,
  type PostgresSourceConfig,
} from "@onirix/db/datasources";
import type { SecretBox } from "@onirix/db/secrets";
import { savedQuery, source, sourceDefaultTeam, team } from "@onirix/db/schema";
import {
  SAVED_QUERY_PARAMETER_TYPES,
  bindSavedQueryParameters,
  countPlaceholders,
} from "@onirix/llm/database";

import { orgProcedure, permissionProcedure, router } from "../index";

const connectionUrlInput = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => /^postgres(ql)?:\/\//i.test(value) && describeConnection(value) !== null,
    "Enter a PostgreSQL connection URL, like postgresql://user:password@host:5432/database.",
  );

const nameInput = z.string().trim().min(1).max(60);
const descriptionInput = z.string().trim().max(400).nullish();
const modeInput = z.enum(["saved", "adhoc"]);

/** A saved query's name is written by a model into a tool argument: a slug. */
const queryNameInput = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, digits and underscores, starting with a letter.");

const parameterInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Parameter names use lowercase letters, digits and underscores."),
  type: z.enum(SAVED_QUERY_PARAMETER_TYPES),
  description: z.string().trim().max(200).nullish(),
});

const savedQueryInput = z.object({
  sourceId: z.string(),
  name: queryNameInput,
  description: z.string().trim().min(1).max(300),
  sql: z.string().trim().min(1).max(20_000),
  parameters: z.array(parameterInput).max(12).default([]),
});

/**
 * The checks a saved query passes before it is stored.
 *
 * The SQL is the admin's and trusted to be a SELECT, but a `$3` with two
 * declared parameters would fail on every call, and two parameters named alike
 * would make the model's arguments ambiguous. Both are caught here, once.
 */
function validateSavedQuery(input: { sql: string; parameters: { name: string }[] }) {
  if (input.sql.includes(";")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Write one statement, without a semicolon.",
    });
  }
  const placeholders = countPlaceholders(input.sql);
  if (placeholders !== input.parameters.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        `The SQL refers to $1..$${placeholders} but ${input.parameters.length} ` +
        `parameter${input.parameters.length === 1 ? " is" : "s are"} declared. They must match.`,
    });
  }
  const names = new Set(input.parameters.map((parameter) => parameter.name));
  if (names.size !== input.parameters.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Parameter names must be unique." });
  }
}

/**
 * Turns the unique-index violation on (source, name) into a message.
 */
function rethrowDuplicateQueryName(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This database already has a saved query with that name.",
    });
  }
  throw error;
}

/**
 * Connects and checks the role, refusing anything that can write.
 *
 * Runs before introspection on connect and before every schema refresh, so a
 * role that was read-only yesterday and gained a grant since is caught the
 * next time an admin touches the connection.
 */
async function requireReadOnlyRole(connectionUrl: string): Promise<void> {
  const verification = await verifyReadOnlyRole(connectionUrl).catch(rethrowConnection);
  if (verification.problems.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: describeRoleProblems(verification) });
  }
}

function normalizeDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** A connection failure, reported in the admin's terms rather than the driver's. */
function rethrowConnection(error: unknown): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Could not connect to the database.",
  });
}

export const databaseRouter = router({
  /** Every connected database in the workspace, without its secret. */
  list: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.source.findMany({
      where: and(eq(source.organizationId, ctx.organizationId), eq(source.type, "postgres")),
      with: {
        defaultTeams: { with: { team: { columns: { id: true, name: true } } } },
        savedQueries: { columns: { id: true } },
      },
      orderBy: asc(source.name),
    });

    return rows.map((row) => {
      const config = readPostgresConfig(row.config, ctx.secrets);
      const connection = config ? describeConnection(config.connectionUrl) : null;
      return {
        id: row.id,
        name: row.name,
        description: config?.description ?? null,
        mode: config?.mode ?? "saved",
        savedQueryCount: row.savedQueries.length,
        host: connection?.host ?? null,
        port: connection?.port ?? null,
        database: connection?.database ?? null,
        user: connection?.user ?? null,
        tableCount: config?.schema.tables.length ?? 0,
        visibility: row.defaultVisibility,
        teams: row.defaultTeams.map((entry) => entry.team),
        status: row.status,
        lastError: row.lastError,
        introspectedAt: row.lastSyncedAt,
      };
    });
  }),

  /**
   * Connects a database: reads its schema and stores the connection.
   *
   * Introspection runs before anything is written, so a wrong password or an
   * unreachable host is a rejected form rather than a broken row.
   */
  connect: permissionProcedure("source", "create")
    .input(
      z.object({
        name: nameInput,
        description: descriptionInput,
        connectionUrl: connectionUrlInput,
        mode: modeInput.default("saved"),
        visibility: z.enum(["organization", "teams"]).default("organization"),
        teamIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const teamIds = input.visibility === "teams" ? [...new Set(input.teamIds)] : [];
      if (input.visibility === "teams" && teamIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose at least one team, or make the database visible to everyone.",
        });
      }
      await assertTeamsBelong(ctx.db, ctx.organizationId, teamIds);

      // The role is checked whatever the mode. A saved query is the admin's
      // SQL, but the connection is still one the model drives, and a database
      // handed to a model is handed to everyone who can talk to the model.
      await requireReadOnlyRole(input.connectionUrl);
      const schema = await introspectPostgres(input.connectionUrl).catch(rethrowConnection);

      const config: PostgresSourceConfig = {
        connectionUrl: input.connectionUrl,
        description: normalizeDescription(input.description),
        schema,
        introspectedAt: new Date().toISOString(),
        mode: input.mode,
      };

      const id = randomUUID();
      await ctx.db.transaction(async (tx) => {
        await tx.insert(source).values({
          id,
          organizationId: ctx.organizationId,
          type: "postgres",
          name: input.name,
          config: sealPostgresConfig(config, ctx.secrets),
          defaultVisibility: input.visibility,
          status: "success",
          lastSyncedAt: new Date(),
        });
        if (teamIds.length > 0) {
          await tx
            .insert(sourceDefaultTeam)
            .values(teamIds.map((teamId) => ({ sourceId: id, teamId })));
        }
      });

      return { id, tableCount: schema.tables.length };
    }),

  /** Edits the label and description. The connection itself is replaced, not edited. */
  update: permissionProcedure("source", "update")
    .input(
      z.object({
        sourceId: z.string(),
        name: nameInput,
        description: descriptionInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { row, config } = await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      await ctx.db
        .update(source)
        .set({
          name: input.name,
          config: sealPostgresConfig(
            { ...config, description: normalizeDescription(input.description) },
            ctx.secrets,
          ),
        })
        .where(eq(source.id, row.id));
      return { id: row.id };
    }),

  /**
   * Re-reads the schema after the database changed shape.
   *
   * A failure is recorded on the row rather than thrown away: the Sources page
   * shows it, which is how an admin learns the credentials stopped working.
   */
  refreshSchema: permissionProcedure("source", "update")
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { row, config } = await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);

      try {
        const verification = await verifyReadOnlyRole(config.connectionUrl);
        if (verification.problems.length > 0) {
          throw new Error(describeRoleProblems(verification));
        }
        const schema = await introspectPostgres(config.connectionUrl);
        await ctx.db
          .update(source)
          .set({
            config: sealPostgresConfig(
              { ...config, schema, introspectedAt: new Date().toISOString() },
              ctx.secrets,
            ),
            status: "success",
            lastError: null,
            lastSyncedAt: new Date(),
          })
          .where(eq(source.id, row.id));
        return { tableCount: schema.tables.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not connect.";
        await ctx.db
          .update(source)
          .set({ status: "failed", lastError: message })
          .where(eq(source.id, row.id));
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  /**
   * Switches between saved queries only and model-written SQL.
   *
   * Takes effect on the next question. Loosening to `adhoc` is the one change
   * here that widens what the model can do, so the page confirms it.
   */
  setMode: permissionProcedure("source", "update")
    .input(z.object({ sourceId: z.string(), mode: modeInput }))
    .mutation(async ({ ctx, input }) => {
      const { row, config } = await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      await ctx.db
        .update(source)
        .set({ config: sealPostgresConfig({ ...config, mode: input.mode }, ctx.secrets) })
        .where(eq(source.id, row.id));
      return { mode: input.mode };
    }),

  /** The saved queries of one database, as the editor lists them. */
  listSavedQueries: orgProcedure
    .input(z.object({ sourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      const rows = await ctx.db.query.savedQuery.findMany({
        where: eq(savedQuery.sourceId, input.sourceId),
        orderBy: asc(savedQuery.name),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        sql: row.sql,
        parameters: readSavedQueryParameters(row.parameters),
        updatedAt: row.updatedAt,
      }));
    }),

  createSavedQuery: permissionProcedure("source", "update")
    .input(savedQueryInput)
    .mutation(async ({ ctx, input }) => {
      await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      validateSavedQuery(input);
      const id = randomUUID();
      await ctx.db
        .insert(savedQuery)
        .values({
          id,
          organizationId: ctx.organizationId,
          sourceId: input.sourceId,
          name: input.name,
          description: input.description,
          sql: input.sql,
          parameters: input.parameters.map((parameter) => ({
            ...parameter,
            description: normalizeDescription(parameter.description),
          })),
          createdBy: ctx.principal.userId,
        })
        .catch(rethrowDuplicateQueryName);
      return { id };
    }),

  updateSavedQuery: permissionProcedure("source", "update")
    .input(savedQueryInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      validateSavedQuery(input);
      const updated = await ctx.db
        .update(savedQuery)
        .set({
          name: input.name,
          description: input.description,
          sql: input.sql,
          parameters: input.parameters.map((parameter) => ({
            ...parameter,
            description: normalizeDescription(parameter.description),
          })),
        })
        .where(
          and(
            eq(savedQuery.id, input.id),
            eq(savedQuery.sourceId, input.sourceId),
            eq(savedQuery.organizationId, ctx.organizationId),
          ),
        )
        .returning({ id: savedQuery.id })
        .catch(rethrowDuplicateQueryName);
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Saved query not found." });
      }
      return { id: input.id };
    }),

  deleteSavedQuery: permissionProcedure("source", "update")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(savedQuery)
        .where(and(eq(savedQuery.id, input.id), eq(savedQuery.organizationId, ctx.organizationId)))
        .returning({ id: savedQuery.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Saved query not found." });
      }
      return { id: input.id };
    }),

  /**
   * Runs a query as the model would, with the values an admin typed.
   *
   * The same binding and the same read-only executor, so what the editor
   * shows is what the assistant will get. Not stored: this is how an admin
   * checks a query before saving it.
   */
  testSavedQuery: permissionProcedure("source", "update")
    .input(
      savedQueryInput.extend({
        values: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { config } = await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      validateSavedQuery(input);
      const bound = bindSavedQueryParameters(
        {
          name: input.name,
          description: input.description,
          sql: input.sql,
          parameters: input.parameters.map((parameter) => ({
            ...parameter,
            description: parameter.description ?? null,
          })),
        },
        input.values,
      );
      if ("error" in bound) {
        throw new TRPCError({ code: "BAD_REQUEST", message: bound.error });
      }
      try {
        const result = await runReadOnlyQuery(config.connectionUrl, input.sql, {
          values: bound.values,
          maxRows: 20,
        });
        return { columns: result.columns, rows: result.rows, truncated: result.truncated };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "The query failed.",
        });
      }
    }),

  /** Disconnects a database. Nothing indexed depends on it, so nothing else moves. */
  remove: permissionProcedure("source", "delete")
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { row, config } = await ownedDatabase(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      await ctx.db.delete(source).where(eq(source.id, row.id));
      // Best effort: the pool is a process-local cache, and this process may
      // not be the one holding it.
      await closeDatabasePool(config.connectionUrl);
      return { id: row.id };
    }),
});

async function ownedDatabase(
  db: Database,
  organizationId: string,
  sourceId: string,
  secrets: SecretBox,
) {
  const row = await db.query.source.findFirst({
    where: and(
      eq(source.id, sourceId),
      eq(source.organizationId, organizationId),
      eq(source.type, "postgres"),
    ),
  });
  const config = row ? readPostgresConfig(row.config, secrets) : null;
  if (!row || !config) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Database not found." });
  }
  return { row, config };
}

async function assertTeamsBelong(db: Database, organizationId: string, teamIds: string[]) {
  if (teamIds.length === 0) return;
  const found = await db
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.organizationId, organizationId), inArray(team.id, teamIds)));
  if (found.length !== teamIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more teams do not belong to this organization.",
    });
  }
}
