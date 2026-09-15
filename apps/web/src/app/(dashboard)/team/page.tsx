import { UserPlusIcon, UsersIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Page, PageHeader } from "@/components/page";

export default function TeamPage() {
  return (
    <Page>
      <PageHeader
        icon={UsersIcon}
        title="Users & Requests"
        description="Invite colleagues and manage the roles that decide what each of them can see."
        action={
          <Button disabled>
            <UserPlusIcon />
            Invite users
          </Button>
        }
      />
      <Empty variant="outline">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>Invites are not wired up yet</EmptyTitle>
          <EmptyDescription>
            Membership and roles are defined in the product spec but have no backend
            behind them so far.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
