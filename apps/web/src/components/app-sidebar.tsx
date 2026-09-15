"use client";

import {
  ArrowLeftIcon,
  BookOpenIcon,
  BotIcon,
  DatabaseIcon,
  PanelLeftIcon,
  RocketIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  SidebarSeparator,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { cn } from "@onirix/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@onirix/ui/components/tooltip";

import { AdminNav } from "@/components/admin-nav";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { NavUser } from "@/components/nav-user";
import { OnirixMark, OnirixWordmark } from "@/components/onirix-mark";

/** The entry point that starts work, pinned above the sections. */
const PRIMARY_ITEMS = [
  { title: "New Session", url: "/chat", icon: SquarePenIcon },
] as const;

const KNOWLEDGE_ITEMS = [
  { title: "Knowledge", url: "/knowledge", icon: BookOpenIcon },
  { title: "Sources", url: "/sources", icon: DatabaseIcon },
] as const;

const AGENT_ITEMS = [{ title: "Explore Agents", url: "/agents", icon: BotIcon }] as const;

/** Where Settings lands, and the prefix that decides which menu is showing. */
const ADMIN_HOME = "/admin/language-models";

export function AppSidebar({
  organizationName,
  setupComplete,
  user,
}: {
  organizationName: string | null;
  /** False until a model is connected, which gates most of the product. */
  setupComplete: boolean;
  user: { name: string; email: string; avatar?: string | null };
}) {
  const pathname = usePathname();
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  const palette = useCommandPalette();

  // The admin menu is not a separate layout: both menus live in one sliding
  // track so moving between them animates instead of swapping in place.
  const inAdmin = pathname.startsWith("/admin");

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

      {/* The two menus are stacked in one clipping frame and slide as a pair,
          so Settings reads as stepping sideways rather than as a new screen. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Pane hidden={inAdmin} offset={inAdmin ? "left" : "none"}>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {!setupComplete ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/onboarding")}
                      tooltip="Finish setup"
                      render={
                        <Link href="/onboarding">
                          <RocketIcon />
                          <span>Finish setup</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ) : null}
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Search"
                    onClick={() => palette.setOpen(true)}
                  >
                    <SearchIcon />
                    <span>Search</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
                  isActive={inAdmin}
                  tooltip="Settings"
                  render={
                    <Link href={ADMIN_HOME}>
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
          </SidebarFooter>
        </Pane>

        <Pane hidden={!inAdmin} offset={inAdmin ? "none" : "right"}>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Search"
                    onClick={() => palette.setOpen(true)}
                  >
                    <SearchIcon />
                    <span>Search</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <AdminNav pathname={pathname} />
          </SidebarContent>

          <SidebarFooter>
            <SidebarSeparator />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Exit admin panel"
                  render={
                    <Link href="/chat">
                      <ArrowLeftIcon />
                      <span>Exit Admin Panel</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Pane>
      </div>

      <SidebarFooter>
        <NavUser
          organizationName={organizationName ?? "Your workspace"}
          user={{ ...user, avatar: user.avatar ?? "" }}
        />
      </SidebarFooter>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </Sidebar>
  );
}

/**
 * One of the two menus in the sliding frame. The one off screen is only
 * clipped, so it also has to leave the tab order and the accessibility tree.
 */
function Pane({
  children,
  hidden,
  offset,
}: {
  children: ReactNode;
  hidden: boolean;
  /** Where the pane sits relative to the frame: `none` is on screen. */
  offset: "none" | "left" | "right";
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col transition-transform duration-300 ease-out motion-reduce:transition-none",
        offset === "left" && "-translate-x-full",
        offset === "right" && "translate-x-full"
      )}
      aria-hidden={hidden}
      inert={hidden}
    >
      {children}
    </div>
  );
}
