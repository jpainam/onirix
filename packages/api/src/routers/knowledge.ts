/**
 * Sources, documents, and knowledge collections.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { collection, document, source } from "@onirix/db/schema";
import { enqueue } from "@onirix/jobs";

import { adminProcedure, orgProcedure, router } from "../index";

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

  createCollection: adminProcedure
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
      const conditions = [eq(document.organizationId, ctx.organizationId)];
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
        ),
        with: { source: true, collection: true },
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
      .where(eq(document.organizationId, ctx.organizationId));

    return row ?? { total: 0, indexed: 0, failed: 0, pending: 0 };
  }),

  /** Re-queues a document whose indexing failed. */
  retryDocument: adminProcedure
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
