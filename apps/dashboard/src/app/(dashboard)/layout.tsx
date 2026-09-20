import { cookies } from "next/headers";
import type { PropsWithChildren } from "react";

import { SidebarInset, SidebarProvider } from "@onirix/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { requireSession } from "@/lib/workspace";

export default async function Layout(props: PropsWithChildren) {
  // Setup runs inside this shell, so an unconfigured workspace is admitted
  // here; the pages that need a model redirect to /onboarding themselves.
  const { user, workspace } = await requireSession();

  // Read on the server so a sidebar that was closed renders closed, rather
  // than open for a frame and then sliding away once the client catches up.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      className="h-svh min-h-0 overflow-hidden"
    >
      <AppSidebar
        organizationName={workspace?.organizationName ?? null}
        setupComplete={Boolean(workspace?.llmConfig)}
        user={{
          name: user.name,
          email: user.email,
          avatar: user.image,
        }}
      />
      {/* No top chrome of the shell's own: a page that wants a header row
          brings one, and the content column owns its own scrolling. */}
      <SidebarInset className="min-h-0 overflow-hidden">
        {props.children}
      </SidebarInset>
    </SidebarProvider>
  );
}
