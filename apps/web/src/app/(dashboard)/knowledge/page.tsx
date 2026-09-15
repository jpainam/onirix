import { BookOpenIcon, FolderPlusIcon } from "lucide-react";

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

export default async function KnowledgePage() {
  await requireConfiguredWorkspace();

  return (
    <Page>
      <PageHeader
        icon={BookOpenIcon}
        title="Knowledge"
        description="Browse what Onirix knows, organized into collections like Engineering or HR."
        action={
          <Button disabled>
            <FolderPlusIcon />
            New collection
          </Button>
        }
      />
      <Empty variant="outline">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyTitle>No collections yet</EmptyTitle>
          <EmptyDescription>
            Collections group documents so an agent can be scoped to one team&apos;s
            material. This area is not built yet — connect a source to get started.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
