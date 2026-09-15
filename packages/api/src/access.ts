/**
 * Access control list construction.
 *
 * PRODUCT.md is explicit that permissions must follow the user: if someone
 * cannot read a document at its source, Onirix must not surface it through AI.
 * These entries are matched against the `access_control_list` written into each
 * chunk at index time.
 *
 * The strings are opaque tokens, not roles — connectors that carry real source
 * permissions will add group and external-principal entries here as they land.
 */
export const PUBLIC_ACL_ENTRY = "public";

export function buildAccessControlList(userId: string, role: string): string[] {
  const entries = [`user:${userId}`];

  // Admins and owners administer the workspace, which includes documents
  // restricted to administrators.
  if (role === "owner" || role === "admin") {
    entries.push("role:admin");
  }

  return entries;
}
