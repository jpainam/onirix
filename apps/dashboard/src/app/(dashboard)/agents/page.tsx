import { BrainIcon, PlusIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Page, PageHeader } from "@/components/page";
import { requireConfiguredWorkspace } from "@/lib/workspace";

export default async function AgentsPage() {
  await requireConfiguredWorkspace();

  return (
    <Page>
      <PageHeader
        icon={BrainIcon}
        title="Explore Agents"
        description="Assistants focused on selected knowledge."
        action={
          <Button disabled>
            <PlusIcon />
            New agent
          </Button>
        }
      />
      <Empty variant="outline">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BrainIcon />
          </EmptyMedia>
          <EmptyTitle>No agents yet</EmptyTitle>
          <EmptyDescription>Agent setup is coming soon.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
