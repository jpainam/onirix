import { BuildingIcon, ShieldIcon } from "lucide-react";

import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { requireConfiguredWorkspace } from "@/lib/workspace";

export default async function OrganizationPage() {
  const { user, workspace } = await requireConfiguredWorkspace();
  const roleLabel = workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1);

  return (
    <Page>
      <PageHeader
        icon={BuildingIcon}
        title="Organization"
        description="Who this workspace belongs to and where its data lives."
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Workspace"
          description="Everyone who signs in with an invite joins this workspace."
        >
          <Row
            icon={<BuildingIcon />}
            title={workspace.organizationName}
            description={`You are signed in as ${user.email}`}
            action={<Badge variant="secondary">{roleLabel}</Badge>}
          />
        </Section>

        <Section title="Privacy">
          <Row
            icon={<ShieldIcon />}
            title="Your data stays in this deployment"
            description="Documents are indexed into your own search cluster; only prompts reach the model provider."
          />
        </Section>
      </div>
    </Page>
  );
}
