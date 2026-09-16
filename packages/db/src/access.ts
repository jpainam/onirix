/**
 * Access control: who holds which tokens, and which tokens a document demands.
 *
 * PRODUCT.md is explicit that permissions must follow the user — if someone
 * cannot read a document at its source, Onirix must not surface it through AI.
 * That promise is only as good as its weakest enforcement point, so the rule
 * lives here once and every reader applies the same one:
 *
 *   visible  <=>  same organization
 *             AND (document is organization-wide OR the reader holds one of
 *                  the tokens in the document's access control list)
 *
 * Three places evaluate it, and all three must agree:
 *   - Postgres, via `visibleToPrincipal` — listing and reading metadata.
 *   - OpenSearch, via the `public` / `access_control_list` chunk fields —
 *     retrieval for search and chat.
 *   - The indexer, via `resolveDocumentAcl` — which writes those chunk fields.
 *
 * The tokens are opaque strings, not roles. Connectors that carry real source
 * permissions will add group and external-principal entries alongside them.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "./index";
import type { Permissions } from "./permissions";
import { document } from "./schema/knowledge";
import type { MemberRole } from "./schema/organization";

/** A document everyone in the organization may read carries no tokens at all. */
export const PUBLIC_ACL_ENTRY = "public";

/** Matches documents restricted to whoever administers the workspace. */
export const ADMIN_ACL_ENTRY = "role:admin";

export function userAclEntry(userId: string): string {
  return `user:${userId}`;
}

export function teamAclEntry(teamId: string): string {
  return `team:${teamId}`;
}

/** The caller, resolved once per request and carried on the context. */
export type Principal = {
  userId: string;
  organizationId: string;
  role: MemberRole;
  /**
   * What `role` resolves to, built-in roles and custom ones alike.
   *
   * Carried on the principal because every gate consults it: a page decides
   * which controls to draw, and the procedure behind each control re-checks the
   * same grants. Documents are not gated by this. They are gated by the tokens
   * below, which is a separate question.
   */
  permissions: Permissions;
  /** Teams within this organization the user belongs to. */
  teamIds: string[];
  /** Tokens the user holds; matched against each document's list. */
  accessControlList: string[];
};

/**
 * The tokens a user holds.
 *
 * `role:admin` is deliberately narrow. It matches documents explicitly marked
 * administrator-only — it is *not* a skeleton key over team-restricted
 * knowledge. An admin outside HR administers HR's sources without reading HR's
 * documents; to read them they must change the document's visibility, which is
 * a recorded act rather than a silent one.
 */
export function buildAccessControlList(options: {
  userId: string;
  role: MemberRole;
  teamIds: string[];
}): string[] {
  const entries = [userAclEntry(options.userId)];

  for (const teamId of options.teamIds) {
    entries.push(teamAclEntry(teamId));
  }

  if (options.role === "owner" || options.role === "admin") {
    entries.push(ADMIN_ACL_ENTRY);
  }

  return entries;
}

export type DocumentVisibility = "organization" | "teams" | "private";

/**
 * The tokens a document demands, derived from its visibility and team grants.
 *
 * The uploader keeps access to what they contributed, so a restricted document
 * never becomes unreachable by the person who put it there — including when
 * `teams` is chosen but no team is picked, which otherwise strands the file.
 *
 * This is the only function that produces the value stored in
 * `document.access_control_list`, so Postgres and OpenSearch cannot disagree
 * about what a document requires.
 */
export function resolveDocumentAcl(options: {
  visibility: DocumentVisibility;
  teamIds: string[];
  uploadedBy: string | null;
}): string[] {
  // An organization-wide document is readable on that basis alone; carrying
  // tokens as well would be dead weight the retrieval filter never consults.
  if (options.visibility === "organization") return [];

  const entries = new Set<string>();
  if (options.uploadedBy) entries.add(userAclEntry(options.uploadedBy));

  if (options.visibility === "teams") {
    for (const teamId of options.teamIds) entries.add(teamAclEntry(teamId));
  }

  return [...entries];
}

/** True when chunks of this document may be retrieved by anyone in the org. */
export function isOrganizationWide(visibility: DocumentVisibility): boolean {
  return visibility === "organization";
}

/**
 * The Postgres half of the rule: a predicate selecting documents the holder of
 * `accessControlList` may see.
 *
 * Mirrors the OpenSearch filter in `packages/search/src/query.ts` clause for
 * clause. `?|` asks whether the jsonb array shares any element with the given
 * text[], which is the same "lists intersect" test as a `terms` query.
 *
 * Callers must still constrain `organization_id` themselves: this narrows
 * within a workspace and never establishes which workspace is in play.
 */
export function visibleToPrincipal(accessControlList: string[]): SQL {
  const tokens = sql.join(
    accessControlList.map((entry) => sql`${entry}`),
    sql`, `,
  );

  return sql`(${document.visibility} = 'organization' OR ${document.accessControlList} ?| ARRAY[${tokens}]::text[])`;
}

/**
 * Recomputes and stores a document's access control list from its current team
 * grants.
 *
 * Call this after anything that changes who may read a document. It returns
 * what the caller needs to mirror the change into the search index: changing
 * who may read a document is meaningless until its chunks agree, and until
 * then the old permissions are the ones retrieval actually enforces.
 */
export async function refreshDocumentAcl(
  db: Database,
  documentId: string,
  organizationId: string,
): Promise<{ accessControlList: string[]; isPublic: boolean } | null> {
  const found = await db.query.document.findFirst({
    where: and(eq(document.id, documentId), eq(document.organizationId, organizationId)),
    with: { teams: true },
  });
  if (!found) return null;

  const accessControlList = resolveDocumentAcl({
    visibility: found.visibility,
    teamIds: found.teams.map((row) => row.teamId),
    uploadedBy: found.uploadedBy,
  });

  await db
    .update(document)
    .set({ accessControlList })
    .where(and(eq(document.id, documentId), eq(document.organizationId, organizationId)));

  return { accessControlList, isPublic: isOrganizationWide(found.visibility) };
}
