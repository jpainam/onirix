/**
 * Who is signed in to the workspace, on what, and how to end it.
 *
 * Sessions are the one piece of security the product can honestly administer
 * today: sign-in methods are deployment configuration (environment variables
 * read at boot), and there is no audit log to expose. What an admin can do is
 * see the live sessions of the people in their workspace and cut one off, which
 * is what "someone left their laptop on a train" actually needs.
 *
 * Revocation is a row delete rather than a Better Auth call, deliberately. Its
 * client endpoints only ever revoke the caller's own sessions, and the admin
 * plugin that can reach another user's is not installed. Deleting the row *is*
 * the revocation Better Auth performs: no cookie cache is configured, so the
 * next request carrying that token finds nothing to look up and is unauthorized.
 * If a `session.cookieCache` is ever enabled in `@onirix/auth`, this stops being
 * immediate and has to go through the plugin instead.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";

import { can } from "@onirix/db/permissions";
import { member, session, user } from "@onirix/db/schema";

import { orgProcedure, permissionProcedure, router } from "../index";

/**
 * Columns safe to hand to the client.
 *
 * `token` is excluded: it is the bearer credential itself, and a page that
 * lists sessions has no use for it.
 */
const sessionColumns = {
  id: session.id,
  userId: session.userId,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
  createdAt: session.createdAt,
  /** Better Auth touches this as it extends a session, so it reads as "last seen". */
  updatedAt: session.updatedAt,
  expiresAt: session.expiresAt,
};

/** A member may hold several roles in one comma separated column. */
function holdsRole(role: string, name: string): boolean {
  return role.split(",").some((part) => part.trim() === name);
}

export const securityRouter = router({
  /**
   * The caller's own live sessions.
   *
   * Open to every member: these are their devices, and being able to see and
   * drop one is not an administrative power.
   */
  mySessions: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select(sessionColumns)
      .from(session)
      .where(and(eq(session.userId, ctx.principal.userId), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt));

    return rows.map((row) => ({ ...row, current: row.id === ctx.session.session.id }));
  }),

  /**
   * Every live session held by a member of this workspace.
   *
   * Gated on `member:update` — the same grant that lets someone change a
   * colleague's role or remove them — because a session row carries an IP
   * address and a device, which is more than a roster tells you.
   *
   * A session belongs to a user, not to an organization, so a member of two
   * workspaces appears in both lists. That is the truth of it: the session is
   * what would be used to reach this workspace's data, whichever one it is
   * currently pointed at.
   */
  workspaceSessions: permissionProcedure("member", "update").query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        ...sessionColumns,
        name: user.name,
        email: user.email,
        role: member.role,
      })
      .from(session)
      .innerJoin(
        member,
        and(
          eq(member.userId, session.userId),
          eq(member.organizationId, ctx.organizationId),
        ),
      )
      .innerJoin(user, eq(user.id, session.userId))
      .where(gt(session.expiresAt, new Date()))
      .orderBy(desc(session.updatedAt));

    return rows.map((row) => ({
      ...row,
      current: row.id === ctx.session.session.id,
      mine: row.userId === ctx.principal.userId,
    }));
  }),

  /**
   * Ends one session.
   *
   * Your own always; someone else's only with `member:update`, and only when
   * they are in this workspace — otherwise an admin could sign out a stranger
   * by guessing an id.
   */
  revoke: orgProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.session.findFirst({
        where: eq(session.id, input.sessionId),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That session is already gone." });
      }

      if (row.id === ctx.session.session.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This is the session you are using. Sign out from the account menu instead.",
        });
      }

      if (row.userId !== ctx.principal.userId) {
        if (!can(ctx.principal.permissions, "member", "update")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Signing another member out requires permission to update member.",
          });
        }

        const target = await ctx.db.query.member.findFirst({
          where: and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, row.userId),
          ),
        });

        // Not found rather than forbidden: whether a session id belongs to
        // someone outside this workspace is not this caller's business.
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That session is already gone." });
        }

        // The owner is protected the way Better Auth protects them from
        // `removeMember`: an admin cannot lock the workspace's owner out.
        if (holdsRole(target.role, "owner")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The workspace owner can only sign their own devices out.",
          });
        }
      }

      await ctx.db.delete(session).where(eq(session.id, row.id));
      return { revoked: 1 };
    }),

  /** Signs the caller out of every device except the one they are on. */
  revokeMyOtherSessions: orgProcedure.mutation(async ({ ctx }) => {
    const removed = await ctx.db
      .delete(session)
      .where(
        and(
          eq(session.userId, ctx.principal.userId),
          ne(session.id, ctx.session.session.id),
        ),
      )
      .returning({ id: session.id });

    return { revoked: removed.length };
  }),
});
