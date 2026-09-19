import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { LanguageModelsView } from "./language-models-view";

export default async function LanguageModelsPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Everyone sees what the workspace runs on; connecting and removing providers
  // needs the Language models grant, which the server checks again on write.
  return <LanguageModelsView canManage={workspaceCan(workspace, "model", "update")} />;
}
