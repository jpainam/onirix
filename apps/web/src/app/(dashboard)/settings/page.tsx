import {
  BuildingIcon,
  CircleCheckIcon,
  CpuIcon,
  LayersIcon,
  Settings2Icon,
  ShieldIcon,
} from "lucide-react";
import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { ResetSettings } from "@/components/reset-settings";
import { ThemeSetting } from "@/components/theme-setting";
import { requireConfiguredWorkspace } from "@/lib/workspace";

export default async function SettingsPage() {
  const { user, workspace } = await requireConfiguredWorkspace();
  const { llmConfig } = workspace;
  const roleLabel = workspace.role.charAt(0).toUpperCase() + workspace.role.slice(1);

  return (
    <Page>
      <PageHeader
        icon={Settings2Icon}
        title="Settings"
        description="Organization, models, and privacy for this workspace."
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Organization"
          description="Everyone who signs in with an invite joins this workspace."
        >
          <Row
            icon={<BuildingIcon />}
            title={workspace.organizationName}
            description={`You are signed in as ${user.email}`}
            action={
              <Badge variant="secondary">{roleLabel}</Badge>
            }
          />
        </Section>

        <Section
          title="Language models"
          description="Chosen during setup. Answers never leave the provider you pick here."
        >
          <div className="flex flex-col gap-2">
            <Row
              icon={<CpuIcon />}
              title={llmConfig.chatModel}
              description={`Chat · ${llmConfig.chatProvider}${
                llmConfig.chatBaseUrl ? ` · ${llmConfig.chatBaseUrl}` : ""
              }`}
              action={
                <Badge variant="success">
                  <CircleCheckIcon />
                  Connected
                </Badge>
              }
            />
            <Row
              icon={<LayersIcon />}
              title={llmConfig.embeddingModel}
              description={`Embedding · ${llmConfig.embeddingProvider} · ${llmConfig.embeddingDimension} dimensions`}
              action={
                <Badge variant="success">
                  <CircleCheckIcon />
                  Connected
                </Badge>
              }
            />
          </div>
          <p className="text-ink-02 text-xs">
            Changing the embedding model means re-indexing every document, so it is not
            editable here yet.
          </p>
        </Section>

        <Section
          title="Appearance"
          description="Applies to this browser only — it is not shared with your team."
        >
          <ThemeSetting />
        </Section>

        <Section title="Privacy">
          <Row
            icon={<ShieldIcon />}
            title="Your data stays in this deployment"
            description="Documents are indexed into your own search cluster; only prompts reach the model provider."
          />
        </Section>

        <Section
          title="Danger zone"
          description="Start setup over without touching what the workspace has learned."
        >
          <ResetSettings />
        </Section>
      </div>
    </Page>
  );
}
