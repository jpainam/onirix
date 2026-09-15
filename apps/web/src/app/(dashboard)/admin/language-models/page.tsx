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
        description="Chosen during setup. Answers never leave the provider you pick here."
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
            Changing the embedding model means re-indexing every document, so it is not
            editable here yet.
          </p>
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
