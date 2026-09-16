/**
 * The access control instance Better Auth checks every organization call against.
 *
 * Statements and built-in grants come from `@onirix/db/permissions`, which is
 * plain data with no dependency on Better Auth. That is what lets the tRPC gates
 * and the admin pages evaluate the same rules without importing this file, and
 * it is why a custom role cannot mean one thing to the plugin and another to
 * Onirix.
 *
 * Passing `ac` and `roles` is also what makes dynamic access control work at
 * all: `/organization/create-role` refuses with MISSING_AC_INSTANCE when the
 * plugin has no pre-defined instance to validate a new role's resources against.
 */
import { BUILT_IN_ROLE_PERMISSIONS, STATEMENTS } from "@onirix/db/permissions";
import { createAccessControl } from "better-auth/plugins/access";

export const ac = createAccessControl(STATEMENTS);

export const roles = {
  owner: ac.newRole(BUILT_IN_ROLE_PERMISSIONS.owner),
  admin: ac.newRole(BUILT_IN_ROLE_PERMISSIONS.admin),
  member: ac.newRole(BUILT_IN_ROLE_PERMISSIONS.member),
};

/**
 * Custom roles a single workspace may hold.
 *
 * Not a licensing limit. Better Auth loads and merges every role in the
 * organization on each permission check, so an unbounded list is a cost paid on
 * every gated request, and a workspace that needs fifty distinct roles has a
 * modelling problem that more rows will not solve.
 */
export const MAXIMUM_ROLES_PER_ORGANIZATION = 25;
