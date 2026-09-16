import { notFound } from "next/navigation";

import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { QueryHistoryView } from "./query-history-view";

export default async function QueryHistoryPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // The only admin page that hides rather than degrades. Everywhere else a
  // missing grant costs you a button; here it is the whole page that shows one
  // member what another asked, so someone without `usage:read` is told the
  // route does not exist rather than shown an empty shell of it.
  if (!workspaceCan(workspace, "usage", "read")) notFound();

  return <QueryHistoryView />;
}
