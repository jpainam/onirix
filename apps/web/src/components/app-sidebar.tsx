"use client";

import {
  BotIcon,
  BookOpenIcon,
  DatabaseIcon,
  MessageSquareIcon,
  SearchIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@onirix/ui/components/sidebar";

import { NavUser } from "@/components/nav-user";

/** The five primary areas from the product definition, plus Settings. */
const NAV_ITEMS = [
  { title: "Chat", url: "/chat", icon: MessageSquareIcon },
  { title: "Search", url: "/search", icon: SearchIcon },
  { title: "Knowledge", url: "/knowledge", icon: BookOpenIcon },
  { title: "Sources", url: "/sources", icon: DatabaseIcon },
  { title: "Agents", url: "/agents", icon: BotIcon },
  { title: "Team", url: "/team", icon: UsersIcon },
] as const;

export function AppSidebar({
  organizationName,
  user,
}: {
  organizationName: string;
  user: { name: string; email: string; avatar?: string | null };
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link href="/chat">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <SearchIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">Onirix</span>
                    <span className="truncate text-xs">{organizationName}</span>
                  </div>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.url)}
                    tooltip={item.title}
                    render={
                      <Link href={item.url}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                render={
                  <Link href="/settings">
                    <Settings2Icon />
                    <span>Settings</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={{ ...user, avatar: user.avatar ?? "" }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
