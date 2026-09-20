/**
 * Conversations and history.
 *
 * Answer generation streams over a route handler rather than tRPC (see
 * `apps/dashboard/src/app/api/chat/route.ts`); this router covers everything around
 * it — listing, renaming, deleting, and reading past conversations.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { visibleToPrincipal } from "@onirix/db/access";
import { chat, chatDocument, citation, document, message } from "@onirix/db/schema";

import { orgProcedure, router } from "../index";

type Context = Parameters<Parameters<typeof orgProcedure.query>[0]>[0]["ctx"];

/** Refuses any conversation that is not the caller's own. */
async function requireOwnChat(ctx: Context, chatId: string) {
  const found = await ctx.db.query.chat.findFirst({
    columns: { id: true },
    where: and(
      eq(chat.id, chatId),
      eq(chat.organizationId, ctx.organizationId),
      eq(chat.userId, ctx.session.user.id),
    ),
  });
  if (!found) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
  }
}

export const chatRouter = router({
  list: orgProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt,
        })
        .from(chat)
        .where(
          and(
            eq(chat.organizationId, ctx.organizationId),
            // Conversations are private to their author until shared.
            eq(chat.userId, ctx.session.user.id),
          ),
        )
        .orderBy(desc(chat.updatedAt))
        .limit(input?.limit ?? 30);
    }),

  /**
   * The id may be supplied by the caller. The chat panel mints one when it
   * mounts so its own state, and the stream it may later have to re-attach to,
   * are keyed on the conversation from the first keystroke rather than from
   * whenever this call returns. It is still only ever a new row: an id already
   * taken is refused, not joined.
   */
  create: orgProcedure
    .input(z.object({ id: z.uuid() }).optional())
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(chat)
        .values({
          id: input?.id ?? randomUUID(),
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        })
        .onConflictDoNothing()
        .returning({ id: chat.id, title: chat.title });

      if (!created) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That conversation already exists.",
        });
      }
      return created;
    }),

  /**
   * The documents this conversation has been pointed at.
   *
   * Filtered by what the caller may see *now*, not by what they could see when
   * they attached it: a document moved to a team they are not on drops out of
   * the list, exactly as it drops out of retrieval.
   */
  documents: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireOwnChat(ctx, input.chatId);

      return ctx.db
        .select({
          id: document.id,
          title: document.title,
          status: document.status,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          attachedAt: chatDocument.createdAt,
        })
        .from(chatDocument)
        .innerJoin(document, eq(document.id, chatDocument.documentId))
        .where(
          and(
            eq(chatDocument.chatId, input.chatId),
            eq(document.organizationId, ctx.organizationId),
            visibleToPrincipal(ctx.principal.accessControlList),
          ),
        )
        .orderBy(asc(chatDocument.createdAt));
    }),

  /**
   * Attaching grants nothing: only documents the caller can already see are
   * accepted, and the rest are dropped without saying which, so the call
   * cannot be used to probe for documents that exist out of sight.
   */
  attachDocuments: orgProcedure
    .input(
      z.object({
        chatId: z.string(),
        documentIds: z.array(z.string()).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireOwnChat(ctx, input.chatId);

      const visible = await ctx.db
        .select({ id: document.id })
        .from(document)
        .where(
          and(
            inArray(document.id, input.documentIds),
            eq(document.organizationId, ctx.organizationId),
            visibleToPrincipal(ctx.principal.accessControlList),
          ),
        );
      if (visible.length === 0) return { attached: 0 };

      await ctx.db
        .insert(chatDocument)
        .values(visible.map((row) => ({ chatId: input.chatId, documentId: row.id })))
        .onConflictDoNothing();

      return { attached: visible.length };
    }),

  /** Only unlinks it from this conversation; the document itself is untouched. */
  detachDocument: orgProcedure
    .input(z.object({ chatId: z.string(), documentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnChat(ctx, input.chatId);

      await ctx.db
        .delete(chatDocument)
        .where(
          and(
            eq(chatDocument.chatId, input.chatId),
            eq(chatDocument.documentId, input.documentId),
          ),
        );
      return { success: true };
    }),

  /** Full conversation with messages and the citations backing each answer. */
  get: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.db.query.chat.findFirst({
        where: and(
          eq(chat.id, input.chatId),
          eq(chat.organizationId, ctx.organizationId),
          eq(chat.userId, ctx.session.user.id),
        ),
      });

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      const messages = await ctx.db.query.message.findMany({
        where: eq(message.chatId, input.chatId),
        orderBy: asc(message.createdAt),
        with: {
          citations: {
            orderBy: asc(citation.index),
            // A citation row snapshots the passage but not where it came from,
            // so the provenance line is recovered through the document it
            // points at. Columns are listed explicitly rather than pulled
            // wholesale: `source.config` holds connector credentials.
            with: {
              document: {
                columns: { sourceUpdatedAt: true },
                with: { source: { columns: { type: true } } },
              },
            },
          },
        },
      });

      return { ...found, messages };
    }),

  rename: orgProcedure
    .input(z.object({ chatId: z.string(), title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(chat)
        .set({ title: input.title })
        .where(
          and(
            eq(chat.id, input.chatId),
            eq(chat.organizationId, ctx.organizationId),
            eq(chat.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: chat.id });

      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }
      return { renamed: true };
    }),

  delete: orgProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Messages and citations cascade from the chat row.
      const deleted = await ctx.db
        .delete(chat)
        .where(
          and(
            eq(chat.id, input.chatId),
            eq(chat.organizationId, ctx.organizationId),
            eq(chat.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: chat.id });

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }
      return { deleted: true };
    }),
});
