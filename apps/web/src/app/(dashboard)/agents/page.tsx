import { BotIcon, PlusIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Page, PageHeader } from "@/components/page";

export default function AgentsPage() {
  return (
    <Page>
      <PageHeader
        icon={BotIcon}
        title="Explore Agents"
        description="Specialized assistants scoped to a subset of your knowledge."
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
            <BotIcon />
          </EmptyMedia>
          <EmptyTitle>No agents yet</EmptyTitle>
          <EmptyDescription>
            An agent pairs a prompt with a slice of your knowledge, so answers stay in
            one domain. This area is not built yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
