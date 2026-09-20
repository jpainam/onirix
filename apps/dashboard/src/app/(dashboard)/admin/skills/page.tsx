import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { SkillsView } from "./skills-view";

export default async function SkillsPage() {
  const { workspace } = await requireWorkspace();
  return <SkillsView canManage={workspaceCan(workspace, "skill", "update")} />;
}
