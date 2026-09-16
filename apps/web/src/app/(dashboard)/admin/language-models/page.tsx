import { requireConfiguredWorkspace } from "@/lib/workspace";

import { LanguageModelsView } from "./language-models-view";

export default async function LanguageModelsPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Members see what the workspace runs on; connecting and removing providers
  // is an admin action, and the server enforces that again on every mutation.
  return <LanguageModelsView canManage={workspace.role !== "member"} />;
}
