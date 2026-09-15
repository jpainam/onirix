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
        description="Documents grouped into collections, like Engineering or HR."
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
            Connect a source to start building your knowledge base.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
