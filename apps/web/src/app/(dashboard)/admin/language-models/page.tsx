import { CircleCheckIcon, CpuIcon, LayersIcon } from "lucide-react";

import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { ResetSettings } from "@/components/reset-settings";
import { requireConfiguredWorkspace } from "@/lib/workspace";

export default async function LanguageModelsPage() {
  const { workspace } = await requireConfiguredWorkspace();
  const { llmConfig } = workspace;

  return (
    <Page>
      <PageHeader
        icon={CpuIcon}
        title="Language Models"
        description="Models used for chat and search."
      />

      <div className="flex flex-col gap-10">
        <Section title="Connected models">
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
            Changing the embedding model requires re-indexing all documents.
          </p>
        </Section>

        <Section
          title="Danger zone"
          description="Restart model setup without deleting workspace data."
        >
          <ResetSettings />
        </Section>
      </div>
    </Page>
  );
}
