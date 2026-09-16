/**
 * Query history: what this workspace has asked, and who asked it.
 *
 * A conversation is the unit, not a message. People ask one thing and then
 * three follow-ups, and a log that lists those as four unrelated queries makes
 * the workspace look busier than it is while hiding the thing an administrator
 * came to find, which is the exchange. Each row is therefore a conversation
 * fronted by its opening question, with the most recent answer under it.
 *
 * Reads are gated on `usage:read`, the same grant as the Usage page and for the
 * same reason: what a workspace asks, and what that costs, are two views of one
 * fact, and both should be grantable to someone who administers nothing else.
 *
 * Note that this is the one place in the product where one member reads
 * another's conversation. PRODUCT.md says conversations are private to their
 * author, and `chat.get` enforces exactly that; the grant is what separates
 * the two, so it is checked on both procedures here rather than only on the
 * page that draws them.
 */
import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { chat, citation, message, user } from "@onirix/db/schema";

import { permissionProcedure, router } from "../index";

/** How much of a message the list carries. Long enough to recognise, short
 *  enough that a page of rows is not a page of transcripts. */
const PREVIEW_CHARS = 300;

/**
 * Wraps a search term for `ilike`.
 *
 * LIKE wildcards in what someone typed are characters, not operators: a bare
 * "%" would otherwise match every conversation in the workspace.
 */
function likePattern(query: string) {
  return `%${query.replace(/([\\%_])/g, "\\$1")}%`;
}

/**
 * The first or last message of a conversation matching `predicate`, truncated.
 *
 * `array_agg(...)[1]` rather than a correlated subquery per column: the rows
 * are already grouped by conversation for the counts, so the previews come out
 * of the same scan. `left()` is applied inside the aggregate so a thread of
 * long answers never materialises in full just to show its first 300 characters.
 */
function edgeMessage(order: SQL, predicate: SQL) {
  return sql<string | null>`(array_agg(
    left(${message.content}, ${sql.raw(String(PREVIEW_CHARS))}) order by ${order}
  ) filter (where ${predicate}))[1]`;
}

export const historyRouter = router({
  /**
   * One page of conversations, narrowed by any combination of the filters.
   *
   * Paged by offset rather than by cursor. A log is something people jump
   * around in (page 7, then back to 2), and a cursor cannot answer "how many
   * are there", which is the number that tells an administrator whether their
   * filter did anything.
   */
  list: permissionProcedure("usage", "read")
    .input(
      z.object({
        /** Matched against the conversation title and every message in it. */
        query: z.string().max(200).default(""),
        /** One member, by user id. Null is everyone. */
        userId: z.string().min(1).nullish(),
        /**
         * Instants, not calendar days. The client sends the start and end of
         * the days it drew, so a range picked in Lagos covers Lagos days.
         * Bucketing here by UTC would cut them at the wrong hour.
         */
        from: z.iso.datetime().nullish(),
        to: z.iso.datetime().nullish(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions: (SQL | undefined)[] = [
        eq(chat.organizationId, ctx.organizationId),
      ];

      if (input.userId) conditions.push(eq(chat.userId, input.userId));
      if (input.from) conditions.push(gte(chat.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(chat.createdAt, new Date(input.to)));

      const search = input.query.trim();
      if (search) {
        const pattern = likePattern(search);
        conditions.push(
          or(
            ilike(chat.title, pattern),
            // The title is a summary the model wrote, so searching it alone
            // would miss the words the person actually typed.
            exists(
              ctx.db
                .select({ found: sql`1` })
                .from(message)
                .where(
                  and(eq(message.chatId, chat.id), ilike(message.content, pattern)),
                ),
            ),
          ),
        );
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [totals, rows] = await Promise.all([
        ctx.db.select({ total: count() }).from(chat).where(where),
        ctx.db
          .select({
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            userId: chat.userId,
            userName: user.name,
            userEmail: user.email,
            userImage: user.image,
          })
          .from(chat)
          .innerJoin(user, eq(user.id, chat.userId))
          .where(where)
          // By when it was asked, which is what a history is ordered by. A
          // conversation someone reopened a month later belongs where it began.
          .orderBy(desc(chat.createdAt))
          .limit(input.pageSize)
          .offset(offset),
      ]);

      const ids = rows.map((row) => row.id);

      // Previews and counts for this page only. Joining them into the query
      // above would aggregate over every conversation the filter matched just
      // to show twenty-five.
      const stats = ids.length
        ? await ctx.db
            .select({
              chatId: message.chatId,
              questions: sql<number>`count(*) filter (where ${message.role} = 'user')::int`,
              question: edgeMessage(
                asc(message.createdAt),
                eq(message.role, "user"),
              ),
              answer: edgeMessage(
                desc(message.createdAt),
                eq(message.role, "assistant"),
              ),
              // The model that answered last. A conversation can span a
              // provider change, and the recent one is the one being asked about.
              model: sql<string | null>`(array_agg(${message.model} order by ${message.createdAt} desc) filter (where ${message.model} is not null))[1]`,
              // int8 out of Postgres, so it arrives as a string.
              tokens: sql<string>`coalesce(sum(coalesce(${message.inputTokens}, 0) + coalesce(${message.outputTokens}, 0)), 0)`,
            })
            .from(message)
            .where(inArray(message.chatId, ids))
            .groupBy(message.chatId)
        : [];

      const byChat = new Map(stats.map((row) => [row.chatId, row]));
      const total = totals[0]?.total ?? 0;

      return {
        page: input.page,
        pageSize: input.pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
        rows: rows.map((row) => {
          const stat = byChat.get(row.id);
          return {
            id: row.id,
            title: row.title,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            /**
             * Null for a conversation created but never asked anything: the
             * chat panel mints the row on mount, so an abandoned tab leaves one
             * behind. The page labels those rather than hiding them, because a
             * history that quietly drops rows cannot be reconciled with a count.
             */
            question: stat?.question ?? null,
            answer: stat?.answer ?? null,
            questions: stat?.questions ?? 0,
            model: stat?.model ?? null,
            tokens: Number(stat?.tokens ?? 0),
            user: {
              id: row.userId,
              name: row.userName,
              email: row.userEmail,
              image: row.userImage,
            },
          };
        }),
      };
    }),

  /**
   * One conversation in full, as the row's detail panel shows it.
   *
   * Scoped by organization in the same statement that looks it up, so an id
   * from another workspace reads as missing rather than forbidden.
   */
  get: permissionProcedure("usage", "read")
    .input(z.object({ chatId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.db.query.chat.findFirst({
        where: and(
          eq(chat.id, input.chatId),
          eq(chat.organizationId, ctx.organizationId),
        ),
        with: {
          user: { columns: { id: true, name: true, email: true, image: true } },
          messages: {
            orderBy: asc(message.createdAt),
            // Listed rather than taken wholesale: `parts` carries the raw tool
            // traffic behind an answer, which is not what this panel reads.
            columns: {
              id: true,
              role: true,
              content: true,
              model: true,
              inputTokens: true,
              outputTokens: true,
              createdAt: true,
            },
            with: {
              citations: {
                orderBy: asc(citation.index),
                columns: {
                  id: true,
                  index: true,
                  documentTitle: true,
                  sourceUrl: true,
                },
              },
            },
          },
        },
      });

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      return found;
    }),
});
