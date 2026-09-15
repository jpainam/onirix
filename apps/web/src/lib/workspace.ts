/**
 * Resolves the caller's organization and its model configuration.
 *
 * Used by route handlers, which do not go through the tRPC `orgProcedure`
 * middleware but need the same scoping.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { member } from "@onirix/db/schema";

import { auth, getDb } from "@/services";

export type Workspace = {
  organizationId: string;
  organizationName: string;
  role: string;
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

export async function loadWorkspace(userId: string): Promise<Workspace | null> {
  const membership = await getDb().query.member.findFirst({
    where: eq(member.userId, userId),
    with: { organization: { with: { llmConfig: true } } },
  });

  if (!membership) return null;

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    llmConfig: membership.organization.llmConfig ?? null,
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

  return { user: session.user, workspace: await loadWorkspace(session.user.id) };
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
