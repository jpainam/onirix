/**
 * What a role may do, expressed as data.
 *
 * Better Auth's organization plugin needs an `AccessControl` instance built from
 * a statement map, and its dynamic access control stores custom roles as JSON in
 * `organization_role`. Both sides have to agree with the gates in tRPC and in
 * the admin pages, so the statements and the built-in roles are declared once
 * here, in a module with no dependencies, and everything else is derived:
 *
 *   packages/auth      builds the `ac` instance and the pre-defined roles
 *   packages/api       gates procedures with `can()`
 *   apps/web           decides which controls to render with `can()`
 *
 * `ac` is Better Auth's own resource name for role management. It is kept as
 * spelled because the plugin checks `ac: ["create"]` internally before it will
 * create a role; the UI labels it "Roles".
 */

/** Every resource a role can be granted actions on, with the actions available. */
export const STATEMENTS = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  source: ["create", "update", "delete"],
  knowledge: ["create", "update", "delete"],
  model: ["read", "update"],
} as const;

export type Resource = keyof typeof STATEMENTS;
export type Action<R extends Resource = Resource> = (typeof STATEMENTS)[R][number];

/**
 * Grants known at compile time, such as the built-in roles below.
 *
 * Actions are checked against the statement they belong to, so a typo like
 * `source: ["publish"]` does not compile.
 */
export type RoleGrants = { [R in Resource]?: Action<R>[] };

/**
 * Grants that came from somewhere at runtime.
 *
 * Deliberately loose on the value side. Rows in `organization_role` are written
 * by Better Auth from client input, so what comes back out of the database is
 * whatever was stored, not something the type system vouched for.
 */
export type Permissions = Partial<Record<Resource, string[]>>;

export const BUILT_IN_ROLES = ["owner", "admin", "member"] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

/**
 * The three roles every workspace starts with.
 *
 * Owner and admin mirror Better Auth's own defaults on its resources, so
 * behaviour does not change for workspaces that never create a custom role.
 * A member holds nothing but reads: the Onirix resources are all write gates,
 * and reading knowledge is governed by teams, not by roles.
 */
export const BUILT_IN_ROLE_PERMISSIONS: Record<BuiltInRole, RoleGrants> = {
  owner: {
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
    source: ["create", "update", "delete"],
    knowledge: ["create", "update", "delete"],
    model: ["read", "update"],
  },
  admin: {
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
    source: ["create", "update", "delete"],
    knowledge: ["create", "update", "delete"],
    model: ["read", "update"],
  },
  member: {
    ac: ["read"],
    model: ["read"],
  },
};

export function isBuiltInRole(role: string): role is BuiltInRole {
  return (BUILT_IN_ROLES as readonly string[]).includes(role);
}

/**
 * The grants a member's `role` column resolves to.
 *
 * Two Better Auth behaviours are reproduced here, because a gate that disagrees
 * with the one inside the plugin is a gate that fails open somewhere:
 *
 *   1. A member may hold several roles, stored comma separated ("admin,sales").
 *   2. A custom role that reuses a built-in name widens it rather than
 *      replacing it, since the plugin merges the stored permission onto the
 *      pre-defined role of the same name.
 */
export function permissionsForRole(
  role: string,
  customRoles: Record<string, Permissions> = {},
): Permissions {
  const merged: Permissions = {};

  for (const name of role.split(",").map((part) => part.trim())) {
    if (!name) continue;
    const builtIn = isBuiltInRole(name) ? BUILT_IN_ROLE_PERMISSIONS[name] : undefined;
    for (const grants of [builtIn, customRoles[name]]) {
      if (!grants) continue;
      for (const [resource, actions] of Object.entries(grants)) {
        const key = resource as Resource;
        merged[key] = [...new Set([...(merged[key] ?? []), ...actions])];
      }
    }
  }

  return merged;
}

/** Whether a resolved set of grants allows one action. */
export function can<R extends Resource>(
  permissions: Permissions,
  resource: R,
  action: Action<R>,
): boolean {
  return permissions[resource]?.includes(action) ?? false;
}
