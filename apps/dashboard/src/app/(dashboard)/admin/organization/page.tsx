import { BuildingIcon, ShieldIcon } from "@onirix/ui/lib/icons";

import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { RenameOrganization } from "./organization-view";

export default async function OrganizationPage() {
  const { user, workspace } = await requireWorkspace();
  const roleLabel = workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1);

  // Rendering decision only. Better Auth re-checks the same grant on the write,
  // so a member who forces the dialog open still gets refused.
  const canManage = workspaceCan(workspace, "organization", "update");

  return (
    <Page>
      <PageHeader
        icon={BuildingIcon}
        title="Organization"
        description="Workspace details and data privacy."
      />

      <div className="flex flex-col gap-10">
        <Section title="Workspace">
          <Row
            icon={<BuildingIcon />}
            title={workspace.organizationName}
            description={`Signed in as ${user.email}`}
            action={
              <div className="flex items-center gap-1">
                <Badge variant="secondary">{roleLabel}</Badge>
                {canManage ? (
                  <RenameOrganization
                    organizationId={workspace.organizationId}
                    name={workspace.organizationName}
                  />
                ) : null}
              </div>
            }
          />
        </Section>

        <Section title="Privacy">
          <Row
            icon={<ShieldIcon />}
            title="Your data stays in this deployment"
            description="Documents stay in your search cluster. Only prompts reach your model provider."
          />
        </Section>
      </div>
    </Page>
  );
}
