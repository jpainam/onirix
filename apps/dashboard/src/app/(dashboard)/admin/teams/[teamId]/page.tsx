import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { TeamView } from "./team-view";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const { workspace } = await requireConfiguredWorkspace();

  // Rendering decision only. Better Auth re-authorizes every write against the
  // same grant, and the roster itself is scoped to this organization by the
  // query that reads it.
  return (
    <TeamView
      teamId={teamId}
      canManage={workspaceCan(workspace, "team", "update")}
    />
  );
}
