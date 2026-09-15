/**
 * Resolves the caller's organization, teams, and model configuration.
 *
 * Used by server components and by the route handlers that do not go through
 * the tRPC `orgProcedure` middleware but need exactly the same scoping. The
 * access tokens come from `resolvePrincipal`, so a page, a tRPC call and the
 * chat endpoint all enforce one rule.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Principal } from "@onirix/db/principal";
import { resolvePrincipal } from "@onirix/db/principal";
import { organization } from "@onirix/db/schema";

import { auth, getDb } from "@/services";

export type Workspace = {
  organizationId: string;
  organizationName: string;
  role: Principal["role"];
  /** Teams the caller belongs to inside this organization. */
  teamIds: string[];
  /** Tokens the caller holds, for filtering documents and chunks. */
  accessControlList: string[];
  llmConfig: {
    chatProvider: string;
    chatModel: string;
    chatApiKey: string | null;
    chatBaseUrl: string | null;
    embeddingProvider: string;
    embeddingModel: string;
    embeddingApiKey: string | null;
    embeddingBaseUrl: string | null;
    embeddingDimension: string;
    indexName: string;
  } | null;
};

export async function loadWorkspace(
  userId: string,
  activeOrganizationId?: string | null,
): Promise<Workspace | null> {
  const db = getDb();
  const principal = await resolvePrincipal(db, userId, activeOrganizationId);
  if (!principal) return null;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, principal.organizationId),
    with: { llmConfig: true },
  });
  if (!org) return null;

  return {
    organizationId: principal.organizationId,
    organizationName: org.name,
    role: principal.role,
    teamIds: principal.teamIds,
    accessControlList: principal.accessControlList,
    llmConfig: org.llmConfig ?? null,
  };
}

/**
 * The signed-in caller and their workspace, which may still be unconfigured.
 *
 * Setup now happens inside the app shell rather than behind a wizard, so the
 * dashboard layout admits users who have not finished it; the pages that need
 * a model are the ones that turn them away.
 */
export async function requireSession(): Promise<{
  user: { id: string; name: string; email: string; image?: string | null };
  workspace: Workspace | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  return {
    user: session.user,
    workspace: await loadWorkspace(
      session.user.id,
      session.session.activeOrganizationId,
    ),
  };
}

/**
 * Same, but for pages that cannot function without a model — they send the
 * user to finish setup instead of failing on the first request.
 */
export async function requireConfiguredWorkspace(): Promise<{
  user: { id: string; name: string; email: string; image?: string | null };
  workspace: Workspace & { llmConfig: NonNullable<Workspace["llmConfig"]> };
}> {
  const { user, workspace } = await requireSession();
  if (!workspace?.llmConfig) redirect("/onboarding");

  return { user, workspace: workspace as never };
}
