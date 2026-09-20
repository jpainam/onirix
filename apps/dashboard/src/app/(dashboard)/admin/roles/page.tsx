import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { RolesView } from "./roles-view";

export default async function RolesPage() {
  const { workspace } = await requireWorkspace();

  // Better Auth refuses to create a role granting anything the creator does not
  // already hold, so the viewer's own grants are passed down to grey out those
  // boxes rather than letting the request fail after the fact.
  return (
    <RolesView
      canManage={workspaceCan(workspace, "ac", "create")}
      grantable={workspace.permissions}
    />
  );
}
