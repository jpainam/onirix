import { BrainIcon, PlusIcon } from "@onirix/ui/lib/icons";

import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Page, PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";

export default async function AgentsPage() {
  await requireWorkspace();

  return (
    <Page wide>
      <PageHeader
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
