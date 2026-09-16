/**
 * Resolves who the caller is acting as: which organization, which teams.
 *
 * Every entry point needs this before it may touch knowledge — tRPC procedures,
 * the upload and chat route handlers, and server components alike — so it lives
 * here rather than being re-derived at each one.
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import { buildAccessControlList, type Principal } from "./access";
import type { Database } from "./index";
import { type Permissions, permissionsForRole } from "./permissions";
import {
  member,
  organizationRole,
  team,
  teamMember,
  type MemberRole,
} from "./schema/organization";

export type { Principal };

/**
 * The caller's organization, teams, and access tokens, or null if they belong
 * to no organization yet.
 *
 * `activeOrganizationId` comes from the session and is what decides scope: a
 * user can belong to several organizations, and picking "their first
 * membership" would silently serve one customer's knowledge while the UI claims
 * another. An active id that no longer resolves to a membership — revoked,
 * deleted, or simply stale — falls back to the oldest membership rather than
 * failing, but it never widens scope beyond a real membership row.
 */
export async function resolvePrincipal(
  db: Database,
  userId: string,
  activeOrganizationId?: string | null,
): Promise<(Principal & { organizationName: string }) | null> {
  const membership = activeOrganizationId
    ? ((await db.query.member.findFirst({
        where: and(
          eq(member.userId, userId),
          eq(member.organizationId, activeOrganizationId),
        ),
        with: { organization: true },
      })) ?? (await oldestMembership(db, userId)))
    : await oldestMembership(db, userId);

  if (!membership) return null;

  const organizationId = membership.organizationId;

  // Team membership is global in Better Auth's schema, so it is intersected
  // with this organization's teams — a team the user joined elsewhere must not
  // grant anything here.
  const teams = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, userId), eq(team.organizationId, organizationId)));

  const teamIds = teams.map((row) => row.teamId);
  const role = membership.role as MemberRole;

  return {
    userId,
    organizationId,
    organizationName: membership.organization.name,
    role,
    permissions: permissionsForRole(role, await loadCustomRoles(db, organizationId, role)),
    teamIds,
    accessControlList: buildAccessControlList({ userId, role, teamIds }),
  };
}

/**
 * The custom roles this member's `role` column might refer to.
 *
 * Only the names the member actually holds are fetched: a workspace may define
 * many roles, and resolving one principal has no reason to read them all. A
 * member on a purely built-in role costs no query at all.
 */
async function loadCustomRoles(
  db: Database,
  organizationId: string,
  role: string,
): Promise<Record<string, Permissions>> {
  const names = role
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (names.length === 0) return {};

  const rows = await db
    .select({ role: organizationRole.role, permission: organizationRole.permission })
    .from(organizationRole)
    .where(
      and(
        eq(organizationRole.organizationId, organizationId),
        inArray(organizationRole.role, names),
      ),
    );

  const custom: Record<string, Permissions> = {};
  for (const row of rows) {
    // Better Auth writes this column as JSON text. A row that is somehow not
    // parseable is treated as granting nothing, rather than taking the request
    // down: a broken role must not become a way in.
    try {
      const parsed: unknown = JSON.parse(row.permission);
      if (parsed && typeof parsed === "object") custom[row.role] = parsed as Permissions;
    } catch {
      custom[row.role] = {};
    }
  }

  return custom;
}

function oldestMembership(db: Database, userId: string) {
  // Oldest rather than arbitrary, so a user with no active organization set
  // lands on the same workspace on every request.
  return db.query.member.findFirst({
    where: eq(member.userId, userId),
    orderBy: asc(member.createdAt),
    with: { organization: true },
  });
}
