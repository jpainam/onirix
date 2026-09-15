import { requireConfiguredWorkspace } from "@/lib/workspace";

import { SourcesView } from "./sources-view";

export default async function SourcesPage() {
  await requireConfiguredWorkspace();

  return <SourcesView />;
}
