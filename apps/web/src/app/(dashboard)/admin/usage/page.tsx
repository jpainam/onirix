import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { UsageView } from "./usage-view";

export default async function UsagePage() {
  const { workspace } = await requireConfiguredWorkspace();

  // The read itself is the privilege here: a usage tile is a summary of what
  // everyone in the workspace asked. The page renders the refusal rather than
  // letting the query fail, so a member who follows the sidebar link gets an
  // explanation instead of an error toast.
  return <UsageView canRead={workspaceCan(workspace, "usage", "read")} />;
}
