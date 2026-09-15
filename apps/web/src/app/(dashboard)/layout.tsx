import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

import { Separator } from "@onirix/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@onirix/ui/components/sidebar";

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
    <SidebarProvider>
      <AppSidebar
        organizationName={workspace.organizationName}
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image,
        }}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <span className="text-sm font-medium">{workspace.organizationName}</span>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">{props.children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
