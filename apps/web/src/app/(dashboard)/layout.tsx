import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

import { SidebarInset, SidebarProvider } from "@onirix/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { loadWorkspace } from "@/lib/workspace";
import { auth } from "@/services";

export default async function Layout(props: PropsWithChildren) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  // Every dashboard page assumes a configured workspace.
  const workspace = await loadWorkspace(session.user.id);
  if (!workspace?.llmConfig) redirect("/onboarding");

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar
        organizationName={workspace.organizationName}
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image,
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
