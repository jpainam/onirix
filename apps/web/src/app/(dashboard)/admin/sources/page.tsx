import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { SourcesView } from "./sources-view";

export default async function SourcesPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Retargeting a document needs the Sources grant; without it the audience is
  // visible but fixed. The server checks the same grant on the mutation.
  return <SourcesView canManage={workspaceCan(workspace, "source", "update")} />;
}
