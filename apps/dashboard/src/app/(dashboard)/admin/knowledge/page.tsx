import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { KnowledgeView } from "./knowledge-view";

export default async function KnowledgePage() {
  const { workspace } = await requireWorkspace();

  // Rendering decisions only. Each procedure behind these controls re-checks the
  // same grant, so a member who forces one open still gets refused.
  return (
    <KnowledgeView
      canCreate={workspaceCan(workspace, "knowledge", "create")}
      canUpdate={workspaceCan(workspace, "knowledge", "update")}
      canDelete={workspaceCan(workspace, "knowledge", "delete")}
    />
  );
}
