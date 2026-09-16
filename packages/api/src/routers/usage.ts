/**
 * What the workspace actually spent, and on what.
 *
 * Every number here is counted from rows the product already writes (messages,
 * conversations, documents, citations) rather than from a metering table kept
 * alongside them. A counter that is incremented on the answering path is a
 * counter that drifts the first time a write fails halfway, and a workspace
 * cannot audit a number it cannot recompute. Token counts are the one thing the
 * rows could not already answer, so they are stored on the message that spent
 * them (see `message.inputTokens`) and summed here like everything else.
 *
 * Reads are gated on `usage:read` rather than on a role, because "who may see
 * what this costs" is a question a workspace should be able to answer with a
 * custom role: a finance owner who administers nothing else.
 */
import { and, eq, gte, isNotNull, not, sql } from "drizzle-orm";
import { z } from "zod";

import { visibleToPrincipal } from "@onirix/db/access";
import { chat, citation, document, message } from "@onirix/db/schema";

import { permissionProcedure, router } from "../index";

/** The windows the page offers, in days. */
const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
type Range = keyof typeof RANGES;

const MS_PER_DAY = 86_400_000;

/**
 * Buckets a timestamp column into a UTC calendar day, as `YYYY-MM-DD`.
 *
 * Formatted in Postgres rather than returned as a timestamp and formatted in
 * JS: a `Date` at midnight UTC renders as the previous day for anyone west of
 * Greenwich, which would silently shift every bar in the chart by one.
 */
function dayOf(column: unknown) {
  return sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;
}

/** Midnight UTC on the day `offset` days before the day containing `now`. */
function utcDayStart(now: Date, offset: number): Date {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day - offset * MS_PER_DAY);
}

type Bucket = { day: string } & Record<string, unknown>;

/**
 * Turns sparse day rows into one point per day in the window.
 *
 * Postgres returns nothing for a day nothing happened on, and a chart drawn
 * straight from those rows reads a quiet weekend as a narrower week rather than
 * as two empty bars. The zeros have to be put back before anything is plotted.
 */
function fill(rows: Bucket[], field: string, from: Date, days: number) {
  const byDay = new Map(rows.map((row) => [row.day, Number(row[field] ?? 0)]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(from.getTime() + index * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
    return { date, value: byDay.get(date) ?? 0 };
  });
}

/** Sum of a filled series, which is the window's total for a count metric. */
function sum(series: { value: number }[]) {
  return series.reduce((total, point) => total + point.value, 0);
}

export const usageRouter = router({
  /**
   * Every tile on the Usage page, for one window and the window before it.
   *
   * The comparison window is fetched in the same scan rather than in a second
   * round trip: the queries are already grouped by day, so asking for twice the
   * range and splitting the rows costs one extra index range and nothing else.
   */
  summary: permissionProcedure("usage", "read")
    .input(z.object({ range: z.enum(Object.keys(RANGES) as [Range, ...Range[]]) }))
    .query(async ({ ctx, input }) => {
      const days = RANGES[input.range];
      const now = new Date();
      // Both windows end today, so the earliest day wanted is 2n-1 days back.
      const from = utcDayStart(now, days * 2 - 1);
      const currentFrom = utcDayStart(now, days - 1);

      const inOrg = eq(chat.organizationId, ctx.organizationId);
      /**
       * Built with `gte` rather than written inline as `created_at >= $1`.
       *
       * `message.createdAt` is `timestamp without time zone`, and drizzle
       * treats those as UTC on the way in and on the way out. A bare `Date`
       * dropped into a raw `sql` fragment misses that encoder and is serialized
       * by node-postgres with the *server process's* offset, which Postgres
       * then discards, so every boundary would silently move by the developer's
       * distance from Greenwich. Going through the column's own comparison is
       * what keeps the two windows where they are meant to be.
       */
      const inCurrentWindow = gte(message.createdAt, currentFrom);

      const [messages, conversations, documents, citations, people, models] =
        await Promise.all([
          // Requests and tokens, which both live on a message but are written by
          // opposite halves of a turn: the question is a user row, the cost is
          // on the answer row beside it.
          ctx.db
            .select({
              day: dayOf(message.createdAt),
              requests: sql<number>`count(*) filter (where ${message.role} = 'user')::int`,
              // int8, so node-postgres hands it back as a string. A workspace
              // can outrun a 32-bit sum of tokens in a way it never will a
              // count of questions.
              tokens: sql<string>`coalesce(sum(coalesce(${message.inputTokens}, 0) + coalesce(${message.outputTokens}, 0)), 0)`,
            })
            .from(message)
            .innerJoin(chat, eq(chat.id, message.chatId))
            .where(and(inOrg, gte(message.createdAt, from)))
            .groupBy(dayOf(message.createdAt)),

          ctx.db
            .select({
              day: dayOf(chat.createdAt),
              conversations: sql<number>`count(*)::int`,
            })
            .from(chat)
            .where(and(inOrg, gte(chat.createdAt, from)))
            .groupBy(dayOf(chat.createdAt)),

          // Filtered by visibility, not just by organization. An admin does not
          // read another team's documents here any more than anywhere else, and
          // a count is a read: "247 documents" tells you how much you cannot see.
          ctx.db
            .select({
              day: dayOf(document.createdAt),
              documents: sql<number>`count(*)::int`,
            })
            .from(document)
            .where(
              and(
                eq(document.organizationId, ctx.organizationId),
                visibleToPrincipal(ctx.principal.accessControlList),
                gte(document.createdAt, from),
              ),
            )
            .groupBy(dayOf(document.createdAt)),

          // How often an answer was grounded in something. Counted per citation
          // row, so an answer standing on four documents counts as four.
          ctx.db
            .select({
              day: dayOf(citation.createdAt),
              citations: sql<number>`count(*)::int`,
            })
            .from(citation)
            .innerJoin(message, eq(message.id, citation.messageId))
            .innerJoin(chat, eq(chat.id, message.chatId))
            .where(and(inOrg, gte(citation.createdAt, from)))
            .groupBy(dayOf(citation.createdAt)),

          // Active people are the one metric whose total is not the sum of its
          // days: someone who asks something every day is one active person for
          // the window and seven daily points. Both are counted here, and the
          // window totals have to be counted distinctly over the window itself.
          ctx.db
            .select({
              day: dayOf(message.createdAt),
              people: sql<number>`count(distinct ${chat.userId})::int`,
            })
            .from(message)
            .innerJoin(chat, eq(chat.id, message.chatId))
            .where(
              and(inOrg, eq(message.role, "user"), gte(message.createdAt, from)),
            )
            .groupBy(dayOf(message.createdAt)),

          // The breakdown under the tiles: where the tokens went. Current window
          // only: a comparison per model is a different page.
          ctx.db
            .select({
              model: message.model,
              answers: sql<number>`count(*)::int`,
              inputTokens: sql<string>`coalesce(sum(${message.inputTokens}), 0)`,
              outputTokens: sql<string>`coalesce(sum(${message.outputTokens}), 0)`,
            })
            .from(message)
            .innerJoin(chat, eq(chat.id, message.chatId))
            .where(
              and(
                inOrg,
                inCurrentWindow,
                isNotNull(message.model),
              ),
            )
            .groupBy(message.model)
            .orderBy(sql`sum(coalesce(${message.inputTokens}, 0) + coalesce(${message.outputTokens}, 0)) desc`),
        ]);

      // Distinct people over each whole window, which no daily grouping gives.
      const [reach] = await ctx.db
        .select({
          current: sql<number>`count(distinct ${chat.userId}) filter (where ${inCurrentWindow})::int`,
          previous: sql<number>`count(distinct ${chat.userId}) filter (where ${not(inCurrentWindow)})::int`,
        })
        .from(message)
        .innerJoin(chat, eq(chat.id, message.chatId))
        .where(and(inOrg, eq(message.role, "user"), gte(message.createdAt, from)));

      /** One tile: the current window's series, and the two window totals. */
      function metric(
        key: string,
        label: string,
        description: string,
        rows: Bucket[],
        field: string,
        totals?: { current: number; previous: number },
      ) {
        const previousSeries = fill(rows, field, from, days);
        const series = fill(rows, field, currentFrom, days);
        return {
          key,
          label,
          description,
          series,
          total: totals?.current ?? sum(series),
          previous: totals?.previous ?? sum(previousSeries),
        };
      }

      return {
        range: input.range,
        days,
        from: currentFrom.toISOString(),
        metrics: [
          metric(
            "requests",
            "Total requests",
            "Questions people asked the assistant.",
            messages,
            "requests",
          ),
          metric(
            "tokens",
            "Tokens used",
            "Input and output together, as each provider reported it.",
            messages,
            "tokens",
          ),
          metric(
            "people",
            "Active people",
            "Members who asked at least one question.",
            people,
            "people",
            { current: reach?.current ?? 0, previous: reach?.previous ?? 0 },
          ),
          metric(
            "conversations",
            "Conversations",
            "Threads started, however long each one ran.",
            conversations,
            "conversations",
          ),
          metric(
            "citations",
            "Sources cited",
            "Documents an answer actually stood on.",
            citations,
            "citations",
          ),
          metric(
            "documents",
            "Documents added",
            "Indexed into the knowledge you can see.",
            documents,
            "documents",
          ),
        ],
        models: models.map((row) => ({
          model: row.model ?? "unknown",
          answers: row.answers,
          inputTokens: Number(row.inputTokens),
          outputTokens: Number(row.outputTokens),
        })),
      };
    }),
});
