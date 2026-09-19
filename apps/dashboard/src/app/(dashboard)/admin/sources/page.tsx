import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { SourcesView } from "./sources-view";

export default async function SourcesPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Rendering decisions only. Every procedure behind these controls checks
  // the same grant again on the server.
  return (
    <SourcesView
      canCreate={workspaceCan(workspace, "source", "create")}
      canManage={workspaceCan(workspace, "source", "update")}
      canDelete={workspaceCan(workspace, "source", "delete")}
    />
  );
}
