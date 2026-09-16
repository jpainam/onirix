import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { SourceView } from "./source-view";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;
  const { workspace } = await requireConfiguredWorkspace();

  return (
    <SourceView
      sourceId={sourceId}
      canManage={workspaceCan(workspace, "source", "update")}
      canDelete={workspaceCan(workspace, "source", "delete")}
    />
  );
}
