import { requireConfiguredWorkspace, workspaceCan } from "@/lib/workspace";

import { UsersView } from "./users-view";

export default async function UsersPage() {
  const { workspace } = await requireConfiguredWorkspace();

  // Two separate grants, because they are two separate jobs: someone who runs
  // onboarding may invite people without being able to change anyone's role.
  // Both are re-authorized on the server by Better Auth.
  return (
    <UsersView
      canManage={workspaceCan(workspace, "member", "update")}
      canInvite={workspaceCan(workspace, "invitation", "create")}
    />
  );
}
