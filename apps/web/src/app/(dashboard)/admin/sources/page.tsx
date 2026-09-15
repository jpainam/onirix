import { requireConfiguredWorkspace } from "@/lib/workspace";

import { SourcesView } from "./sources-view";

export default async function SourcesPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Retargeting a document is an admin action; members see the audience but
  // cannot change it. The server enforces this again on the mutation.
  return <SourcesView canManage={workspace.role !== "member"} />;
}
