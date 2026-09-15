import { PaletteIcon } from "lucide-react";

import { Page, PageHeader, Section } from "@/components/page";
import { ThemeSetting } from "@/components/theme-setting";
import { requireConfiguredWorkspace } from "@/lib/workspace";

export default async function AppearancePage() {
  await requireConfiguredWorkspace();

  return (
    <Page>
      <PageHeader
        icon={PaletteIcon}
        title="Appearance & Theming"
        description="How Onirix looks for you."
      />

      <Section
        title="Theme"
        description="Applies to this browser only, not shared with your team."
      >
        <ThemeSetting />
      </Section>
    </Page>
  );
}
