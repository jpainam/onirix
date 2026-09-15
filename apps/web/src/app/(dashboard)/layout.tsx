import type { PropsWithChildren } from "react";

import { SidebarInset, SidebarProvider } from "@onirix/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { requireSession } from "@/lib/workspace";

export default async function Layout(props: PropsWithChildren) {
  // Setup runs inside this shell, so an unconfigured workspace is admitted
  // here; the pages that need a model redirect to /onboarding themselves.
  const { user, workspace } = await requireSession();

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar
        organizationName={workspace?.organizationName ?? null}
        setupComplete={Boolean(workspace?.llmConfig)}
        user={{
          name: user.name,
          email: user.email,
          avatar: user.image,
        }}
      />
      {/* No top chrome: the sidebar carries navigation, so the content column
          runs the full height of the frame and owns its own scrolling. */}
      <SidebarInset className="min-h-0 overflow-hidden">
        {props.children}
      </SidebarInset>
    </SidebarProvider>
  );
}
