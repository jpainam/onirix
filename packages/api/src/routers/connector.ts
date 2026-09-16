/**
 * Connected sources: websites, drives and buckets the worker reads on a
 * schedule.
 *
 * A connector is a `source` row whose `config` a `@onirix/connectors` factory
 * understands. Connecting one validates the settings against the real system
 * before anything is stored, so a wrong key is a rejected form rather than a
 * source that fails on its first night. Every credential goes in sealed and
 * comes back out blanked.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  CONNECTOR_TYPES,
  type ConnectorConfig,
  ConnectorError,
  DRIVE_READONLY_SCOPE,
  connectorConfigSchema,
  connectorConfigUpdateSchema,
  createConnector,
  describeConfig,
  mergeSecrets,
  redactConfig,
} from "@onirix/connectors";
import type { Database } from "@onirix/db";
import { readConnectorConfig, sealConnectorConfig } from "@onirix/db/connectors";
import {
  account,
  document,
  source,
  sourceDefaultTeam,
  sourceSyncRun,
  team,
  user,
} from "@onirix/db/schema";
import type { SecretBox } from "@onirix/db/secrets";
import { enqueue } from "@onirix/jobs";

import { orgProcedure, permissionProcedure, router } from "../index";

const nameInput = z.string().trim().min(1).max(80);

/** Manual, or at least every quarter hour and at most every 30 days. */
const syncIntervalInput = z.number().int().min(15).max(60 * 24 * 30).nullable();

const audienceInput = z.object({
  visibility: z.enum(["organization", "teams"]).default("organization"),
  teamIds: z.array(z.string()).default([]),
});

/** A sync's outcome, as the Sources page shows it. */
const runColumns = {
  id: sourceSyncRun.id,
  sourceId: sourceSyncRun.sourceId,
  status: sourceSyncRun.status,
  startedAt: sourceSyncRun.startedAt,
  finishedAt: sourceSyncRun.finishedAt,
  createdAt: sourceSyncRun.createdAt,
  error: sourceSyncRun.error,
  notes: sourceSyncRun.notes,
  documentsSeen: sourceSyncRun.documentsSeen,
  documentsAdded: sourceSyncRun.documentsAdded,
  documentsUpdated: sourceSyncRun.documentsUpdated,
  documentsRemoved: sourceSyncRun.documentsRemoved,
  documentsUnchanged: sourceSyncRun.documentsUnchanged,
  requestedBy: sourceSyncRun.requestedBy,
};

/** How long a connect may spend proving the settings work before the form gives up. */
const VALIDATE_TIMEOUT_MS = 45_000;

export const connectorRouter = router({
  /** Every connector in the workspace with its latest sync, and no secrets. */
  list: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.source.findMany({
      where: and(eq(source.organizationId, ctx.organizationId), inArray(source.type, [...CONNECTOR_TYPES])),
      with: { defaultTeams: { with: { team: { columns: { id: true, name: true } } } } },
      orderBy: desc(source.createdAt),
    });
    if (rows.length === 0) return [];

    const latest = await latestRuns(
      ctx.db,
      rows.map((row) => row.id),
    );

    return rows.map((row) => {
      const config = readConnectorConfig(row.config, ctx.secrets);
      return {
        id: row.id,
        type: row.type as (typeof CONNECTOR_TYPES)[number],
        name: row.name,
        summary: config ? describeConfig(config) : "Settings could not be read.",
        status: row.status,
        lastSyncedAt: row.lastSyncedAt,
        lastError: row.lastError,
        documentCount: row.documentCount,
        syncIntervalMinutes: row.syncIntervalMinutes,
        visibility: row.defaultVisibility,
        teams: row.defaultTeams.map((entry) => entry.team),
        lastRun: latest.get(row.id) ?? null,
        createdAt: row.createdAt,
      };
    });
  }),

  /** One connector in full: settings with secrets blanked, and its sync history. */
  get: orgProcedure.input(z.object({ sourceId: z.string() })).query(async ({ ctx, input }) => {
    const { row, config } = await ownedConnector(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);

    const runs = await ctx.db
      .select({ ...runColumns, requesterName: user.name })
      .from(sourceSyncRun)
      .leftJoin(user, eq(user.id, sourceSyncRun.requestedBy))
      .where(eq(sourceSyncRun.sourceId, row.id))
      .orderBy(desc(sourceSyncRun.createdAt))
      .limit(20);

    const teams = await ctx.db
      .select({ id: team.id, name: team.name })
      .from(sourceDefaultTeam)
      .innerJoin(team, eq(team.id, sourceDefaultTeam.teamId))
      .where(eq(sourceDefaultTeam.sourceId, row.id));

    return {
      id: row.id,
      type: row.type as (typeof CONNECTOR_TYPES)[number],
      name: row.name,
      summary: config ? describeConfig(config) : "Settings could not be read.",
      config: config ? redactConfig(config) : null,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt,
      lastError: row.lastError,
      documentCount: row.documentCount,
      syncIntervalMinutes: row.syncIntervalMinutes,
      visibility: row.defaultVisibility,
      teams,
      createdAt: row.createdAt,
      runs,
    };
  }),

  /**
   * Connects a source and queues its first sync.
   *
   * The settings are tried against the real system first: the site is
   * fetched, the bucket listed, the drive folder looked up. Only then is
   * anything stored.
   */
  create: permissionProcedure("source", "create")
    .input(
      audienceInput.extend({
        name: nameInput,
        config: connectorConfigUpdateSchema,
        syncIntervalMinutes: syncIntervalInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const teamIds = await checkAudience(ctx.db, ctx.organizationId, input);
      const config = await completeConfig(ctx, input.config, null);
      await validateConfig(config, ctx.connectors);

      const id = randomUUID();
      const runId = randomUUID();
      await ctx.db.transaction(async (tx) => {
        await tx.insert(source).values({
          id,
          organizationId: ctx.organizationId,
          type: config.type,
          name: input.name,
          config: sealConnectorConfig(config, ctx.secrets),
          defaultVisibility: input.visibility,
          syncIntervalMinutes: input.syncIntervalMinutes,
          status: "queued",
          createdBy: ctx.principal.userId,
        });
        if (teamIds.length > 0) {
          await tx.insert(sourceDefaultTeam).values(teamIds.map((teamId) => ({ sourceId: id, teamId })));
        }
        await tx.insert(sourceSyncRun).values({
          id: runId,
          organizationId: ctx.organizationId,
          sourceId: id,
          status: "queued",
          requestedBy: ctx.principal.userId,
        });
      });

      await enqueue(ctx.queue, {
        type: "sync_source",
        organizationId: ctx.organizationId,
        sourceId: id,
        runId,
      });

      return { id };
    }),

  /**
   * Edits a connector. Settings are re-validated when they change; a blank
   * secret keeps the stored one, so a form that only renamed the source does
   * not have to know the key.
   */
  update: permissionProcedure("source", "update")
    .input(
      z.object({
        sourceId: z.string(),
        name: nameInput.optional(),
        syncIntervalMinutes: syncIntervalInput.optional(),
        config: connectorConfigUpdateSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { row, config: existing } = await ownedConnector(
        ctx.db,
        ctx.organizationId,
        input.sourceId,
        ctx.secrets,
      );

      const changes: Partial<typeof source.$inferInsert> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.syncIntervalMinutes !== undefined) changes.syncIntervalMinutes = input.syncIntervalMinutes;

      if (input.config) {
        if (input.config.type !== row.type) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A source cannot change kind. Add a new one instead." });
        }
        const config = await completeConfig(ctx, input.config, existing);
        await validateConfig(config, ctx.connectors);
        changes.config = sealConnectorConfig(config, ctx.secrets);
      }

      if (Object.keys(changes).length > 0) {
        await ctx.db.update(source).set(changes).where(eq(source.id, row.id));
      }
      return { id: row.id };
    }),

  /** Queues a sync now. One at a time per source: a second request waits for the first. */
  syncNow: permissionProcedure("source", "update")
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { row } = await ownedConnector(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);
      if (row.status === "queued" || row.status === "in_progress") {
        throw new TRPCError({ code: "CONFLICT", message: "A sync of this source is already running." });
      }

      const runId = randomUUID();
      await ctx.db.transaction(async (tx) => {
        await tx.insert(sourceSyncRun).values({
          id: runId,
          organizationId: ctx.organizationId,
          sourceId: row.id,
          status: "queued",
          requestedBy: ctx.principal.userId,
        });
        await tx.update(source).set({ status: "queued" }).where(eq(source.id, row.id));
      });

      await enqueue(ctx.queue, {
        type: "sync_source",
        organizationId: ctx.organizationId,
        sourceId: row.id,
        runId,
      });
      return { runId };
    }),

  /**
   * Removes a connector and everything it brought in.
   *
   * The rows go now, in one cascade. The chunks and stored originals go when
   * the worker gets to them, which is why their ids are gathered first: once
   * the rows are gone nothing else knows what to purge.
   */
  remove: permissionProcedure("source", "delete")
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { row } = await ownedConnector(ctx.db, ctx.organizationId, input.sourceId, ctx.secrets);

      const documents = await ctx.db
        .select({ id: document.id, fileKey: document.fileKey })
        .from(document)
        .where(eq(document.sourceId, row.id));

      await ctx.db.delete(source).where(eq(source.id, row.id));

      for (let i = 0; i < documents.length; i += 500) {
        await enqueue(ctx.queue, {
          type: "purge_documents",
          organizationId: ctx.organizationId,
          documents: documents.slice(i, i + 500),
        });
      }

      return { id: row.id, documents: documents.length };
    }),

  /**
   * What this deployment can offer a connector form beyond the basics, so
   * the form shows a choice only when choosing it would work.
   */
  capabilities: orgProcedure.query(({ ctx }) => ({
    googleOAuth: ctx.googleOAuth !== null,
    browserRendering: ctx.connectors.firecrawlApiKey !== null,
  })),

  /**
   * Whether the caller has linked a Google account that Drive can be read
   * with, for the Google Drive form to offer "use my account".
   */
  googleAccount: orgProcedure.query(async ({ ctx }) => {
    if (!ctx.googleOAuth) return { available: false as const, linked: false, hasDriveAccess: false };

    const linked = await ctx.db.query.account.findFirst({
      where: and(eq(account.userId, ctx.principal.userId), eq(account.providerId, "google")),
      columns: { refreshToken: true, scope: true },
    });

    return {
      available: true as const,
      linked: Boolean(linked),
      hasDriveAccess: Boolean(
        linked?.refreshToken && (linked.scope ?? "").split(/[\s,]+/).includes(DRIVE_READONLY_SCOPE),
      ),
    };
  }),
});

/**
 * Turns form input into a complete config: blank secrets filled from the
 * stored config on edit, and a "use my Google account" choice filled from
 * the caller's linked account.
 */
async function completeConfig(
  ctx: { db: Database; principal: { userId: string }; googleOAuth: { clientId: string; clientSecret: string } | null },
  incoming: z.infer<typeof connectorConfigUpdateSchema>,
  existing: ConnectorConfig | null,
): Promise<ConnectorConfig> {
  let candidate: z.infer<typeof connectorConfigUpdateSchema> = incoming;

  if (candidate.type === "google_drive" && candidate.auth.kind === "oauth") {
    // The browser never sees the token; the server copies it from the
    // account Better Auth linked, and only for the person asking.
    if (!ctx.googleOAuth) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Google sign-in is not configured on this deployment." });
    }
    const linked = await ctx.db.query.account.findFirst({
      where: and(eq(account.userId, ctx.principal.userId), eq(account.providerId, "google")),
      columns: { refreshToken: true, scope: true },
    });
    const scopes = (linked?.scope ?? "").split(/[\s,]+/);
    if (!linked?.refreshToken || !scopes.includes(DRIVE_READONLY_SCOPE)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Link your Google account with Drive access first, then try again.",
      });
    }
    const who = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.principal.userId),
      columns: { email: true },
    });
    candidate = {
      ...candidate,
      auth: {
        kind: "oauth",
        refreshToken: linked.refreshToken,
        clientId: ctx.googleOAuth.clientId,
        clientSecret: ctx.googleOAuth.clientSecret,
        accountEmail: who?.email ?? null,
      },
    };
  }

  const merged = existing ? mergeSecrets(candidate as ConnectorConfig, existing) : candidate;
  const strict = connectorConfigSchema.safeParse(merged);
  if (!strict.success) {
    const issue = strict.error.issues[0];
    const field = issue?.path.map(String).filter((part) => part !== "auth").join(".") ?? "settings";
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: issue?.code === "too_small" ? `${labelFor(field)} is required.` : `${labelFor(field)}: ${issue?.message ?? "invalid"}`,
    });
  }
  return strict.data;
}

function labelFor(field: string): string {
  return (
    {
      baseUrl: "Web address",
      privateKey: "Service account key",
      clientEmail: "Service account email",
      clientSecret: "Client secret",
      clientId: "Client ID",
      tenantId: "Tenant ID",
      accessKeyId: "Access key ID",
      secretAccessKey: "Secret access key",
      bucket: "Bucket",
      users: "People",
    }[field] ?? field
  );
}

/** Runs the connector's own check, with a deadline and a message in the admin's terms. */
async function validateConfig(
  config: ConnectorConfig,
  options: { allowPrivateNetworks: boolean; firecrawlApiKey: string | null },
): Promise<void> {
  const connector = createConnector(config, options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConnectorError("unreachable", "Checking the source took too long. Try again, or check that it is reachable.")),
      VALIDATE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([connector.validate(), deadline]);
  } catch (error) {
    if (error instanceof ConnectorError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "The source could not be checked.",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkAudience(
  db: Database,
  organizationId: string,
  input: { visibility: "organization" | "teams"; teamIds: string[] },
): Promise<string[]> {
  const teamIds = input.visibility === "teams" ? [...new Set(input.teamIds)] : [];
  if (input.visibility === "teams" && teamIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose at least one team, or make the source visible to everyone.",
    });
  }
  if (teamIds.length > 0) {
    const found = await db
      .select({ id: team.id })
      .from(team)
      .where(and(eq(team.organizationId, organizationId), inArray(team.id, teamIds)));
    if (found.length !== teamIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more teams do not belong to this organization." });
    }
  }
  return teamIds;
}

async function ownedConnector(db: Database, organizationId: string, sourceId: string, secrets: SecretBox) {
  const row = await db.query.source.findFirst({
    where: and(
      eq(source.id, sourceId),
      eq(source.organizationId, organizationId),
      inArray(source.type, [...CONNECTOR_TYPES]),
    ),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found." });
  return { row, config: readConnectorConfig(row.config, secrets) };
}

/** The newest run of each source, in one query rather than one per row. */
async function latestRuns(db: Database, sourceIds: string[]) {
  const rows = await db
    .selectDistinctOn([sourceSyncRun.sourceId], runColumns)
    .from(sourceSyncRun)
    .where(inArray(sourceSyncRun.sourceId, sourceIds))
    .orderBy(sourceSyncRun.sourceId, desc(sourceSyncRun.createdAt), sql`${sourceSyncRun.id}`);
  return new Map(rows.map((row) => [row.sourceId, row]));
}
