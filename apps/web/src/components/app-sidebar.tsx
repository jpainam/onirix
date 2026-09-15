"use client";

import {
  BookOpenIcon,
  BotIcon,
  DatabaseIcon,
  PanelLeftIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
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
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@onirix/ui/components/tooltip";

import { NavUser } from "@/components/nav-user";
import { OnirixMark, OnirixWordmark } from "@/components/onirix-mark";

/** The two entry points that start work, pinned above the sections. */
const PRIMARY_ITEMS = [
  { title: "New Session", url: "/chat", icon: SquarePenIcon },
  { title: "Search", url: "/search", icon: SearchIcon },
] as const;

const KNOWLEDGE_ITEMS = [
  { title: "Knowledge", url: "/knowledge", icon: BookOpenIcon },
  { title: "Sources", url: "/sources", icon: DatabaseIcon },
] as const;

const AGENT_ITEMS = [{ title: "Explore Agents", url: "/agents", icon: BotIcon }] as const;

export function AppSidebar({
  organizationName,
  user,
}: {
  organizationName: string;
  user: { name: string; email: string; avatar?: string | null };
}) {
  const pathname = usePathname();
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Collapsed, the mark *is* the unfold control: it swaps to the panel
            icon on hover, so the sidebar can still be opened on touch, where
            there is no hover to reveal anything. */}
        <div className="group/brand flex h-8 items-center justify-between">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label="Open sidebar"
                    className="hover:bg-sidebar-accent mx-auto flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                  />
                }
              >
                <OnirixMark className="size-5.5 group-hover/brand:hidden" />
                <PanelLeftIcon className="text-ink-03 hidden size-4.5 group-hover/brand:block" />
              </TooltipTrigger>
              <TooltipContent side="right">Open sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Link href="/chat" aria-label="Onirix home">
                <OnirixWordmark />
              </Link>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Close sidebar"
                      className="text-ink-02 hover:bg-sidebar-accent hover:text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                    />
                  }
                >
                  <PanelLeftIcon className="size-4.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Close sidebar</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {PRIMARY_ITEMS.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={pathname === item.url}
                  tooltip={item.title}
                  render={
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {AGENT_ITEMS.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.url)}
                  tooltip={item.title}
                  render={
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Knowledge</SidebarGroupLabel>
          <SidebarMenu>
            {KNOWLEDGE_ITEMS.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.url)}
                  tooltip={item.title}
                  render={
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          {/* `chat.list` already returns past conversations, but reopening one
              needs the chat page to rehydrate its messages from `chat.get` —
              until that exists, listing them here would be a dead link. */}
          <p className="text-ink-02 px-2 py-1.5 text-sm leading-snug">
            Try sending a message! Your chat history will appear here.
          </p>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/settings")}
              tooltip="Settings"
              render={
                <Link href="/settings">
                  <Settings2Icon />
                  <span>Settings</span>
                </Link>
              }
            />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/team")}
              tooltip="Team"
              render={
                <Link href="/team">
                  <UsersIcon />
                  <span>Team</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser
          organizationName={organizationName}
          user={{ ...user, avatar: user.avatar ?? "" }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
