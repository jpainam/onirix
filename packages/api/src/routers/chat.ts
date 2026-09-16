/**
 * Conversations and history.
 *
 * Answer generation streams over a route handler rather than tRPC (see
 * `apps/web/src/app/api/chat/route.ts`); this router covers everything around
 * it — listing, renaming, deleting, and reading past conversations.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { chat, citation, message } from "@onirix/db/schema";

import { orgProcedure, router } from "../index";

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
