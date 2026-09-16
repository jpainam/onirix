/**
 * Members, teams, and pending invitations.
 *
 * Reads only. Every mutation — invite, remove, change role, create a team, move
 * someone between teams — goes through Better Auth's organization endpoints
 * from the client, so its permission checks, limits, owner protection and
 * invitation lifecycle apply. Re-implementing those here would mean two
 * enforcement paths that have to agree forever.
 *
 * What Better Auth does not offer is one call that returns members *with* the
 * teams each belongs to, which is exactly the view the Users page renders.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  BUILT_IN_ROLE_PERMISSIONS,
  BUILT_IN_ROLES,
  type Permissions,
} from "@onirix/db/permissions";
import {
  invitation,
  member,
  organizationRole,
  team,
  teamMember,
  user,
} from "@onirix/db/schema";

import { orgProcedure, permissionProcedure, router } from "../index";

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

  /**
   * Teams in this organization, with their member counts.
   *
   * The count is taken from the membership rows rather than from Better Auth's
   * `team.memberCount` column: the column is bookkeeping kept in step by writes,
   * and a team page whose header disagrees with its own roster is worse than one
   * extra join.
   */
  listTeams: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: team.id,
        name: team.name,
        memberCount: count(teamMember.id),
        createdAt: team.createdAt,
      })
      .from(team)
      .leftJoin(teamMember, eq(teamMember.teamId, team.id))
      .where(eq(team.organizationId, ctx.organizationId))
      .groupBy(team.id, team.name, team.createdAt)
      .orderBy(asc(team.name));

    return rows.map((row) => ({
      ...row,
      /** Whether the caller is in it, which the UI marks on the caller's teams. */
      joined: ctx.principal.teamIds.includes(row.id),
    }));
  }),

  /**
   * A page of this organization's members, each with the teams they belong
   * to.
   *
   * Paged and searched on the server: a workspace of ten thousand people is
   * the case this page exists for, and shipping the roster whole to filter it
   * in the browser would make it the slowest page in the product. The count
   * comes back with the page so the table can say where it is.
   *
   * Visible to every member: knowing who your colleagues are is not the same as
   * reading what they have, and a workspace where the roster is secret cannot
   * explain to anyone why an answer omitted something.
   */
  listMembers: orgProcedure
    .input(
      z.object({
        /** Matched against name and email, case-insensitively. */
        query: z.string().max(200).default(""),
        /** One role name, as stored; a member holding it among several matches. */
        role: z.string().max(60).nullish(),
        teamId: z.string().nullish(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(member.organizationId, ctx.organizationId)];

      const query = input.query.trim();
      if (query) {
        const pattern = `%${query.replace(/([\\%_])/g, "\\$1")}%`;
        const match = or(ilike(user.name, pattern), ilike(user.email, pattern));
        if (match) conditions.push(match);
      }
      if (input.role) {
        // Roles are stored comma separated, so match the name as a whole item.
        conditions.push(
          sql`${input.role} = any(string_to_array(${member.role}, ','))`,
        );
      }
      if (input.teamId) {
        conditions.push(
          sql`exists (select 1 from ${teamMember} where ${teamMember.userId} = ${member.userId} and ${teamMember.teamId} = ${input.teamId})`,
        );
      }
      const where = and(...conditions);

      const [members, [total]] = await Promise.all([
        ctx.db
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
          .where(where)
          .orderBy(asc(user.name), asc(member.createdAt))
          .limit(input.pageSize)
          .offset(input.page * input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(where),
      ]);

      if (members.length === 0) {
        return { items: [], total: total?.count ?? 0, page: input.page, pageSize: input.pageSize };
      }

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

      return {
        items: members.map((row) => ({ ...row, teams: byUser.get(row.userId) ?? [] })),
        total: total?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * One team and its roster, for the team's own page.
   *
   * Scoped by organization in the same statement that looks the team up, so a
   * team id from another workspace reads as missing rather than forbidden:
   * "no such team" is the honest answer to someone it was never shown to.
   */
  getTeam: orgProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select({
          id: team.id,
          name: team.name,
          createdAt: team.createdAt,
        })
        .from(team)
        .where(
          and(eq(team.id, input.teamId), eq(team.organizationId, ctx.organizationId)),
        )
        .limit(1);

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
      }

      const members = await ctx.db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: member.role,
          joinedAt: teamMember.createdAt,
        })
        .from(teamMember)
        .innerJoin(user, eq(user.id, teamMember.userId))
        // Through `member`, so someone who left the organization but kept a
        // stale team row does not show up as a colleague.
        .innerJoin(
          member,
          and(
            eq(member.userId, teamMember.userId),
            eq(member.organizationId, ctx.organizationId),
          ),
        )
        .where(eq(teamMember.teamId, found.id))
        .orderBy(asc(user.name));

      return {
        ...found,
        memberCount: members.length,
        joined: ctx.principal.teamIds.includes(found.id),
        members,
      };
    }),

  /**
   * Members of this organization matching a query, for the add-to-team picker.
   *
   * The search runs here rather than over a full roster held in the browser: a
   * workspace of any size would otherwise ship every colleague's name and email
   * to render one dialog, and the list would go stale the moment someone joins.
   * `excludeTeamId` leaves out who is already on the team, so the dialog offers
   * additions only and cannot be used to toggle someone out by accident.
   */
  searchMembers: orgProcedure
    .input(
      z.object({
        query: z.string().max(200).default(""),
        excludeTeamId: z.string().min(1).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const query = input.query.trim();
      // LIKE wildcards in what someone typed are characters, not operators:
      // a bare "%" would otherwise match the whole roster.
      const pattern = `%${query.replace(/([\\%_])/g, "\\$1")}%`;

      const conditions = [eq(member.organizationId, ctx.organizationId)];

      if (query) {
        const match = or(ilike(user.name, pattern), ilike(user.email, pattern));
        if (match) conditions.push(match);
      }

      if (input.excludeTeamId) {
        const existing = await ctx.db
          .select({ userId: teamMember.userId })
          .from(teamMember)
          .innerJoin(team, eq(team.id, teamMember.teamId))
          .where(
            and(
              eq(teamMember.teamId, input.excludeTeamId),
              eq(team.organizationId, ctx.organizationId),
            ),
          );

        if (existing.length > 0) {
          conditions.push(
            notInArray(
              member.userId,
              existing.map((row) => row.userId),
            ),
          );
        }
      }

      return ctx.db
        .select({
          memberId: member.id,
          userId: member.userId,
          role: member.role,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(and(...conditions))
        .orderBy(asc(user.name))
        .limit(input.limit);
    }),

  /**
   * Every role a member of this organization can hold, built-in and custom.
   *
   * Built-in roles are not rows, they are declared in `@onirix/db/permissions`,
   * so this is the one place that puts both kinds in a single list. The counts
   * come from the member table, which is what makes "who is actually a
   * Librarian?" answerable before an admin deletes the role.
   *
   * Readable by any member: a member who is told "you cannot do that" is owed
   * the ability to see which role would have let them.
   */
  listRoles: orgProcedure.query(async ({ ctx }) => {
    const custom = await ctx.db
      .select({
        id: organizationRole.id,
        role: organizationRole.role,
        permission: organizationRole.permission,
        createdAt: organizationRole.createdAt,
      })
      .from(organizationRole)
      .where(eq(organizationRole.organizationId, ctx.organizationId))
      .orderBy(asc(organizationRole.role));

    const members = await ctx.db
      .select({ role: member.role })
      .from(member)
      .where(eq(member.organizationId, ctx.organizationId));

    // A member may hold several roles in one comma separated column, so each
    // name is counted separately rather than the column being counted whole.
    const counts = new Map<string, number>();
    for (const row of members) {
      for (const name of row.role.split(",").map((part) => part.trim())) {
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    const builtIn = BUILT_IN_ROLES.map((name) => ({
      id: name,
      name,
      builtIn: true as const,
      permissions: BUILT_IN_ROLE_PERMISSIONS[name] as Permissions,
      memberCount: counts.get(name) ?? 0,
    }));

    return [
      ...builtIn,
      ...custom.map((row) => ({
        id: row.id,
        name: row.role,
        builtIn: false as const,
        permissions: parsePermissions(row.permission),
        memberCount: counts.get(row.role) ?? 0,
      })),
    ];
  }),

  /**
   * A page of outstanding invitations.
   *
   * Admin-only: a pending invitation reveals that a named person is being
   * brought in, which can be a hiring or reorganization signal before it is
   * public.
   */
  listInvitations: permissionProcedure("invitation", "create")
    .input(
      z.object({
        query: z.string().max(200).default(""),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(invitation.organizationId, ctx.organizationId),
        eq(invitation.status, "pending"),
      ];
      const query = input.query.trim();
      if (query) {
        conditions.push(ilike(invitation.email, `%${query.replace(/([\\%_])/g, "\\$1")}%`));
      }
      const where = and(...conditions);

      const [rows, [total]] = await Promise.all([
        ctx.db
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
          .where(where)
          .orderBy(desc(invitation.createdAt))
          .limit(input.pageSize)
          .offset(input.page * input.pageSize),
        ctx.db.select({ count: sql<number>`count(*)::int` }).from(invitation).where(where),
      ]);

      const now = Date.now();
      return {
        items: rows.map((row) => ({
          ...row,
          /** Better Auth only marks expiry on use, so compute it for display. */
          expired: row.expiresAt.getTime() < now,
        })),
        total: total?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
});

/** Better Auth stores a role's grants as JSON text; a broken row grants nothing. */
function parsePermissions(value: string): Permissions {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Permissions) : {};
  } catch {
    return {};
  }
}
