import { Row, Section, TILE } from "@onirix/ui/components/settings-section";
import { cn } from "@onirix/ui/lib/utils";

import { Page, PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";

import { Shortcuts } from "./shortcuts";

export default async function GeneralPage() {
  const { user } = await requireWorkspace();

  return (
    <Page>
      <PageHeader title="General" />
      <div className="flex flex-col gap-10">
        <Section title="Account">
          <div className={cn("divide-y", TILE)}>
            <Row title="Name" description={user.name} />
            <Row title="Email" description={user.email} />
          </div>
        </Section>
        <Shortcuts />
      </div>
    </Page>
  );
}
