import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { TeamsView } from "./teams-view";

export default async function TeamsPage() {
  const { workspace } = await requireWorkspace();

  // Rendering decision only. Better Auth re-authorizes every write against the
  // same grant, so a member who forces the controls open still gets refused.
  return <TeamsView canManage={workspaceCan(workspace, "team", "update")} />;
}
