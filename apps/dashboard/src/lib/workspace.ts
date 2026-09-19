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

import { can, type Action, type Permissions, type Resource } from "@onirix/db/permissions";
import type { Principal } from "@onirix/db/principal";
import { resolvePrincipal } from "@onirix/db/principal";
import { organization } from "@onirix/db/schema";

import { openNullable } from "@onirix/db/secrets";

import { auth, getDb, getSecrets } from "@/services";

export type Workspace = {
  organizationId: string;
  organizationName: string;
  role: Principal["role"];
  /** What the caller's role grants, resolved once per request. */
  permissions: Permissions;
  /** Teams the caller belongs to inside this organization. */
  teamIds: string[];
  /** Tokens the caller holds, for filtering documents and chunks. */
  accessControlList: string[];
  llmConfig: {
    chatProvider: string;
    chatModel: string;
    embeddingProvider: string;
    embeddingModel: string;
    embeddingApiKey: string | null;
    embeddingBaseUrl: string | null;
    embeddingDimension: string;
    indexName: string;
  } | null;
  /** Providers the workspace has connected, with the models enabled on each. */
  llmProviders: {
    provider: string;
    apiKey: string | null;
    baseUrl: string | null;
    chatModels: string[];
  }[];
};

/**
 * Credentials for reaching one of the workspace's providers.
 *
 * Keys live on the provider row rather than on the model configuration, so
 * anything that wants to call a model looks the provider up here first.
 */
export function providerCredentials(
  workspace: Workspace,
  provider: string,
): { apiKey: string | null; baseUrl: string | null } {
  const row = workspace.llmProviders.find((candidate) => candidate.provider === provider);
  return { apiKey: row?.apiKey ?? null, baseUrl: row?.baseUrl ?? null };
}

/**
 * Whether the caller may do one thing, for deciding what a page renders.
 *
 * Only a rendering decision. The procedure behind every control checks the same
 * grant with `permissionProcedure`, so forcing a hidden control open achieves
 * nothing.
 */
export function workspaceCan<R extends Resource>(
  workspace: Pick<Workspace, "permissions">,
  resource: R,
  action: Action<R>,
): boolean {
  return can(workspace.permissions, resource, action);
}

export async function loadWorkspace(
  userId: string,
  activeOrganizationId?: string | null,
): Promise<Workspace | null> {
  const db = getDb();
  const principal = await resolvePrincipal(db, userId, activeOrganizationId);
  if (!principal) return null;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, principal.organizationId),
    with: { llmConfig: true, llmProviders: true },
  });
  if (!org) return null;

  // Credentials are stored sealed and opened here, once, so everything that
  // calls a model from a workspace holds the key it needs and nothing reads a
  // ciphertext by accident. This object is server-only: it never crosses to a
  // client component as a whole.
  const secrets = getSecrets();

  return {
    organizationId: principal.organizationId,
    organizationName: org.name,
    role: principal.role,
    permissions: principal.permissions,
    teamIds: principal.teamIds,
    accessControlList: principal.accessControlList,
    llmConfig: org.llmConfig
      ? {
          ...org.llmConfig,
          embeddingApiKey: openNullable(secrets, org.llmConfig.embeddingApiKey),
        }
      : null,
    llmProviders: org.llmProviders.map((row) => ({
      ...row,
      apiKey: openNullable(secrets, row.apiKey),
    })),
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
