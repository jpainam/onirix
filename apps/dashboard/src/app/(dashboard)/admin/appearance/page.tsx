
import { RestoreAppearanceButton } from "@onirix/ui/components/appearance-settings";

import { AppearanceView } from "@/components/appearance-view";
import { Page, PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";

export default async function AppearancePage() {
  await requireWorkspace();

  return (
    <Page>
      <PageHeader
        title="Appearance"
        description="Theme, typography and contrast, kept in this browser."
        action={<RestoreAppearanceButton />}
      />
      <AppearanceView />
    </Page>
  );
}
