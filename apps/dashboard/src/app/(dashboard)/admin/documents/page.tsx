import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { DocumentsView } from "./documents-view";

export default async function DocumentsPage() {
  const { workspace } = await requireWorkspace();

  // Rendering decisions only. Every procedure behind these controls checks
  // the same grant again on the server.
  return (
    <DocumentsView
      canManage={workspaceCan(workspace, "source", "update")}
      canDelete={workspaceCan(workspace, "source", "delete")}
    />
  );
}
