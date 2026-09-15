import {
  BuildingIcon,
  CircleCheckIcon,
  CpuIcon,
  LayersIcon,
  Settings2Icon,
  ShieldIcon,
} from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { ThemeSetting } from "@/components/theme-setting";
import { loadWorkspace } from "@/lib/workspace";
import { auth } from "@/services";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const workspace = await loadWorkspace(session.user.id);
  if (!workspace?.llmConfig) redirect("/onboarding");

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
            description={`You are signed in as ${session.user.email}`}
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
      </div>
    </Page>
  );
}
