/**
 * Resolves the caller's organization and its model configuration.
 *
 * Used by route handlers, which do not go through the tRPC `orgProcedure`
 * middleware but need the same scoping.
 */
import { eq } from "drizzle-orm";

import { member } from "@onirix/db/schema";

import { getDb } from "@/services";

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
