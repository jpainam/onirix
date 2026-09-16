/**
 * Sources, documents, and knowledge collections.
 *
 * Every read here filters by visibility as well as organization. Listing a
 * document leaks its title, size and source even when the body is never
 * returned, so the metadata queries enforce the same rule retrieval does
 * rather than trusting the search index to be the only way in.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { refreshDocumentAcl, visibleToPrincipal } from "@onirix/db/access";
import {
  collection,
  document,
  documentTeam,
  source,
  sourceDefaultTeam,
  team,
} from "@onirix/db/schema";
import { enqueue } from "@onirix/jobs";

import { orgProcedure, permissionProcedure, router } from "../index";

const visibilityInput = z.object({
  documentId: z.string(),
  visibility: z.enum(["organization", "teams", "private"]),
  /** Required when visibility is `teams`; ignored otherwise. */
  teamIds: z.array(z.string()).default([]),
});

export const knowledgeRouter = router({
  /** Sources with their operational state, as the Sources page shows them. */
  listSources: orgProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: source.id,
        type: source.type,
        name: source.name,
        status: source.status,
        lastSyncedAt: source.lastSyncedAt,
        lastError: source.lastError,
        documentCount: source.documentCount,
        defaultVisibility: source.defaultVisibility,
      })
      .from(source)
      .where(eq(source.organizationId, ctx.organizationId))
      .orderBy(desc(source.createdAt));
  }),

  listCollections: orgProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(collection)
      .where(eq(collection.organizationId, ctx.organizationId))
      .orderBy(collection.name);
  }),

  createCollection: permissionProcedure("knowledge", "create")
    .input(z.object({ name: z.string().min(1).max(80), description: z.string().max(400).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(collection)
        .values({
          id: randomUUID(),
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
        })
        .returning();
      return created;
    }),

  listDocuments: orgProcedure
    .input(
      z.object({
        sourceId: z.string().nullish(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(document.organizationId, ctx.organizationId),
        visibleToPrincipal(ctx.principal.accessControlList),
      ];
      if (input.sourceId) conditions.push(eq(document.sourceId, input.sourceId));

      return ctx.db
        .select({
          id: document.id,
          title: document.title,
          status: document.status,
          chunkCount: document.chunkCount,
          indexError: document.indexError,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          sourceUrl: document.sourceUrl,
          sourceUpdatedAt: document.sourceUpdatedAt,
          visibility: document.visibility,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(and(...conditions))
        .orderBy(desc(document.createdAt))
        .limit(input.limit);
    }),

  getDocument: orgProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.db.query.document.findFirst({
        where: and(
          eq(document.id, input.documentId),
          // Scope by organization: an ID from another tenant must not resolve.
          eq(document.organizationId, ctx.organizationId),
          // And by visibility: an ID guessed from another team must not
          // resolve either. A 404 rather than a 403, so the response does not
          // confirm that the document exists.
          visibleToPrincipal(ctx.principal.accessControlList),
        ),
        with: { source: true, collection: true, teams: { with: { team: true } } },
      });

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      }
      return found;
    }),

  /**
   * Indexing progress, for the onboarding "learning your organization" screen
   * and the Sources page.
   */
  indexingProgress: orgProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        indexed: sql<number>`count(*) filter (where ${document.status} = 'indexed')::int`,
        failed: sql<number>`count(*) filter (where ${document.status} = 'failed')::int`,
        pending: sql<number>`count(*) filter (where ${document.status} in ('pending','processing'))::int`,
      })
      .from(document)
      .where(
        and(
          eq(document.organizationId, ctx.organizationId),
          visibleToPrincipal(ctx.principal.accessControlList),
        ),
      );

    return row ?? { total: 0, indexed: 0, failed: 0, pending: 0 };
  }),

  /**
   * Retargets a document at a different audience.
   *
   * Admin-only and deliberately so: with admins unable to read another
   * team's documents, widening one is the supported way in, and it should
   * be a considered act rather than a side effect of browsing.
   */
  setDocumentVisibility: permissionProcedure("source", "update")
    .input(visibilityInput)
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.query.document.findFirst({
        where: and(
          eq(document.id, input.documentId),
          eq(document.organizationId, ctx.organizationId),
        ),
        columns: { id: true },
      });
      if (!owned) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      }

      const teamIds = input.visibility === "teams" ? [...new Set(input.teamIds)] : [];

      // Teams are named by the client, so confirm each one is a team of *this*
      // organization before granting it anything.
      if (teamIds.length > 0) {
        const found = await ctx.db
          .select({ id: team.id })
          .from(team)
          .where(and(eq(team.organizationId, ctx.organizationId), inArray(team.id, teamIds)));

        if (found.length !== teamIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more teams do not belong to this organization.",
          });
        }
      }

      if (input.visibility === "teams" && teamIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose at least one team, or make the document private instead.",
        });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.update(document)
          .set({ visibility: input.visibility })
          .where(eq(document.id, input.documentId));

        await tx.delete(documentTeam).where(eq(documentTeam.documentId, input.documentId));

        if (teamIds.length > 0) {
          await tx.insert(documentTeam).values(
            teamIds.map((teamId) => ({ documentId: input.documentId, teamId })),
          );
        }
      });

      await refreshDocumentAcl(ctx.db, input.documentId, ctx.organizationId);

      // Postgres now enforces the new rule, but retrieval still enforces the
      // old one until the worker rewrites the chunks.
      await enqueue(ctx.queue, {
        type: "sync_document_access",
        organizationId: ctx.organizationId,
        documentId: input.documentId,
      });

      return { visibility: input.visibility, teamIds };
    }),

  /** Sets the visibility newly ingested documents from a source inherit. */
  setSourceDefaultVisibility: permissionProcedure("source", "update")
    .input(
      z.object({
        sourceId: z.string(),
        visibility: z.enum(["organization", "teams", "private"]),
        teamIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.query.source.findFirst({
        where: and(
          eq(source.id, input.sourceId),
          eq(source.organizationId, ctx.organizationId),
        ),
        columns: { id: true },
      });
      if (!owned) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found." });
      }

      const teamIds = input.visibility === "teams" ? [...new Set(input.teamIds)] : [];

      if (teamIds.length > 0) {
        const found = await ctx.db
          .select({ id: team.id })
          .from(team)
          .where(and(eq(team.organizationId, ctx.organizationId), inArray(team.id, teamIds)));

        if (found.length !== teamIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more teams do not belong to this organization.",
          });
        }
      }

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(source)
          .set({ defaultVisibility: input.visibility })
          .where(eq(source.id, input.sourceId));

        await tx
          .delete(sourceDefaultTeam)
          .where(eq(sourceDefaultTeam.sourceId, input.sourceId));

        if (teamIds.length > 0) {
          await tx.insert(sourceDefaultTeam).values(
            teamIds.map((teamId) => ({ sourceId: input.sourceId, teamId })),
          );
        }
      });

      // Existing documents keep the visibility they were ingested with:
      // silently re-permissioning a backlog is the kind of surprise that
      // either exposes or hides knowledge nobody asked to move.
      return { visibility: input.visibility, teamIds };
    }),

  /** Re-queues a document whose indexing failed. */
  retryDocument: permissionProcedure("source", "update")
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(document)
        .set({ status: "pending", indexError: null })
        .where(
          and(
            eq(document.id, input.documentId),
            eq(document.organizationId, ctx.organizationId),
          ),
        )
        .returning({ id: document.id });

      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      }

      await enqueue(ctx.queue, {
        type: "index_document",
        organizationId: ctx.organizationId,
        documentId: input.documentId,
      });

      return { queued: true };
    }),
});
