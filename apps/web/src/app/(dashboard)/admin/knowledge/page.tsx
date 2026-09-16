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
        description="Group documents into collections."
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
          <EmptyDescription>Connect a source to get started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
