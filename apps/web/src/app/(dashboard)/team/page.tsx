import { requireConfiguredWorkspace } from "@/lib/workspace";

import { TeamView } from "./team-view";

export default async function TeamPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Rendering decision only. Every mutation the page offers is re-authorized on
  // the server by Better Auth, so a member who forces the controls open still
  // gets refused.
  return <TeamView canManage={workspace.role !== "member"} />;
}
