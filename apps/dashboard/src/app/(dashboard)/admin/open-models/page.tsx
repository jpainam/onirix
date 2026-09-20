import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { OpenModelsView } from "./open-models-view";

export default async function OpenModelsPage() {
  const { workspace } = await requireWorkspace();

  // Everyone may browse; downloading and removing needs the Language models
  // grant, which the server checks again on every write.
  return <OpenModelsView canManage={workspaceCan(workspace, "model", "update")} />;
}
