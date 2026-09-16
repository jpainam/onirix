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
        description="Workspace details and data privacy."
      />

      <div className="flex flex-col gap-10">
        <Section title="Workspace">
          <Row
            icon={<BuildingIcon />}
            title={workspace.organizationName}
            description={`Signed in as ${user.email}`}
            action={<Badge variant="secondary">{roleLabel}</Badge>}
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
