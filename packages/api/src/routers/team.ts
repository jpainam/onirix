/**
 * Members, departments, and pending invitations.
 *
 * Reads only. Every mutation — invite, remove, change role, create a team, move
 * someone between teams — goes through Better Auth's organization endpoints
 * from the client, so its permission checks, limits, owner protection and
 * invitation lifecycle apply. Re-implementing those here would mean two
 * enforcement paths that have to agree forever.
 *
 * What Better Auth does not offer is one call that returns members *with* the
 * teams each belongs to, which is exactly the view the Team page renders.
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  invitation,
  member,
  team,
  teamMember,
  user,
} from "@onirix/db/schema";

import { adminProcedure, orgProcedure, router } from "../index";

export const teamRouter = router({
  /**
   * Who the caller is and what they may see, for rendering the shell.
   *
   * The client needs the team list to build visibility pickers, and its own
   * role to know which controls to offer — neither is a secret, and neither is
   * sufficient on its own, since the server re-checks both on every write.
   */
  me: orgProcedure.query(async ({ ctx }) => {
    return {
      userId: ctx.principal.userId,
      organizationId: ctx.organizationId,
      organizationName: ctx.organization.name,
      role: ctx.principal.role,
      teamIds: ctx.principal.teamIds,
    };
  }),

  /** Every organization the caller belongs to, for the workspace switcher. */
  myOrganizations: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.member.findMany({
      where: eq(member.userId, ctx.principal.userId),
      with: { organization: { columns: { id: true, name: true, slug: true } } },
      orderBy: asc(member.createdAt),
    });

    return rows.map((row) => ({
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      role: row.role,
      isActive: row.organizationId === ctx.organizationId,
    }));
  }),

  /** Departments in this organization, with their member counts. */
  listTeams: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: team.id,
        name: team.name,
        memberCount: team.memberCount,
        createdAt: team.createdAt,
      })
      .from(team)
      .where(eq(team.organizationId, ctx.organizationId))
      .orderBy(asc(team.name));

    return rows.map((row) => ({
      ...row,
      /** Whether the caller is in it — the UI marks their own departments. */
      joined: ctx.principal.teamIds.includes(row.id),
    }));
  }),

  /**
   * Members of this organization, each with the teams they belong to.
   *
   * Visible to every member: knowing who your colleagues are is not the same as
   * reading what they have, and a workspace where the roster is secret cannot
   * explain to anyone why an answer omitted something.
   */
  listMembers: orgProcedure.query(async ({ ctx }) => {
    const members = await ctx.db
      .select({
        memberId: member.id,
        userId: member.userId,
        role: member.role,
        joinedAt: member.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, ctx.organizationId))
      .orderBy(asc(member.createdAt));

    if (members.length === 0) return [];

    // Team membership rows are not organization-scoped, so the join through
    // `team` is what keeps a user's teams in another workspace out of this list.
    const memberships = await ctx.db
      .select({ userId: teamMember.userId, teamId: team.id, teamName: team.name })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(
        and(
          eq(team.organizationId, ctx.organizationId),
          inArray(
            teamMember.userId,
            members.map((row) => row.userId),
          ),
        ),
      );

    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const row of memberships) {
      const list = byUser.get(row.userId) ?? [];
      list.push({ id: row.teamId, name: row.teamName });
      byUser.set(row.userId, list);
    }

    return members.map((row) => ({
      ...row,
      teams: byUser.get(row.userId) ?? [],
    }));
  }),

  /**
   * Outstanding invitations.
   *
   * Admin-only: a pending invitation reveals that a named person is being
   * brought in, which can be a hiring or reorganization signal before it is
   * public.
   */
  listInvitations: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        teamId: invitation.teamId,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        inviterName: user.name,
      })
      .from(invitation)
      .innerJoin(user, eq(user.id, invitation.inviterId))
      .where(
        and(
          eq(invitation.organizationId, ctx.organizationId),
          eq(invitation.status, "pending"),
        ),
      )
      .orderBy(asc(invitation.createdAt));

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      /** Better Auth only marks expiry on use, so compute it for display. */
      expired: row.expiresAt.getTime() < now,
    }));
  }),
});
