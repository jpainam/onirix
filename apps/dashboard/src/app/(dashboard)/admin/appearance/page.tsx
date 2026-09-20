import { PaletteIcon } from "@onirix/ui/lib/icons";

import { RestoreAppearanceButton } from "@onirix/ui/components/appearance-settings";

import { AppearanceView } from "@/components/appearance-view";
import { Page, PageHeader } from "@/components/page";
import { requireWorkspace } from "@/lib/workspace";

export default async function AppearancePage() {
  await requireWorkspace();

  return (
    <Page>
      <PageHeader
        icon={PaletteIcon}
        title="Appearance"
        description="Customize the theme, typography and contrast. Kept in this browser, not shared with your team."
        action={<RestoreAppearanceButton />}
      />
      <AppearanceView />
    </Page>
  );
}
