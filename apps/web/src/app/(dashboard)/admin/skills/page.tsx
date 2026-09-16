import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { SkillsView } from "./skills-view";

export default async function SkillsPage() {
  const { workspace } = await requireConfiguredWorkspace();
  return <SkillsView canManage={workspaceCan(workspace, "skill", "update")} />;
}
