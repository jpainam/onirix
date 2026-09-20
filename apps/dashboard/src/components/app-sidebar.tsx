"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainIcon,
  PanelLeftIcon,
  RocketIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
} from "@onirix/ui/lib/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@onirix/ui/components/tooltip";
import { cn } from "@onirix/ui/lib/utils";

import { AdminNav } from "@/components/admin-nav";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/command-palette";
import { NavUser } from "@/components/nav-user";
import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";
import { RecentConversations } from "@/components/recent-conversations";
import { useDesktop, useDesktopMac } from "@/hooks/use-desktop-mac";

/** The entry point that starts work, pinned above the sections. */
const PRIMARY_ITEMS = [
  { title: "New Session", url: "/chat", icon: SquarePenIcon },
] as const;

const AGENT_ITEMS = [
  { title: "Explore Agents", url: "/agents", icon: BrainIcon },
] as const;

/** Where the Setting panel entry lands; `/admin` also decides which menu shows. */
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
  const { toggleSidebar, state, isMobile } = useSidebar();
  const palette = useCommandPalette();

  // Closed, the sidebar is gone entirely rather than shrunk to a strip of
  // icons, so the page gets the whole window. On a phone it is a sheet, which
  // is closed until asked for. Either way something has to open it again.
  const closed = state === "collapsed" || isMobile;

  // In the macOS desktop window the toggle lives beside the window controls
  // whether the sidebar is open or closed, so it never moves under the
  // pointer. The sidebar's own header then carries the wordmark alone.
  const desktopMac = useDesktopMac();

  // The admin menu is not a separate layout: both menus live in one sliding
  // track so moving between them animates instead of swapping in place.
  const inAdmin = pathname.startsWith("/admin");
  const [settingsQuery, setSettingsQuery] = useState("");

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex h-8 items-center justify-between">
            <Link href="/chat" aria-label="Onirix home">
              <OnirixWordmark />
            </Link>
            {desktopMac ? null : (
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
            )}
          </div>
        </SidebarHeader>

        {/* The two menus are stacked in one clipping frame and slide as a pair, so
            the settings panel reads as stepping sideways rather than as a new screen. */}
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
                <SidebarGroupLabel>Recents</SidebarGroupLabel>
                {/* Nothing can have been said yet without a model, so an
                    unconfigured workspace does not pay for the request. */}
                <RecentConversations enabled={setupComplete} />
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="pb-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={inAdmin}
                    tooltip="Settings"
                    render={
                      <Link href={ADMIN_HOME}>
                        <SettingsIcon />
                        <span>Settings</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Pane>

          <Pane hidden={!inAdmin} offset={inAdmin ? "none" : "right"}>
            <SidebarContent>
              {/* The way out comes first, where the eye lands as the menu
                  slides in, and the search under it narrows the rows below. */}
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={
                        <Link href="/chat">
                          <ArrowLeftIcon />
                          <span>Back to app</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarInput
                  type="search"
                  value={settingsQuery}
                  onChange={(event) => setSettingsQuery(event.target.value)}
                  placeholder="Search settings"
                  aria-label="Search settings"
                />
              </SidebarGroup>
              <AdminNav pathname={pathname} query={settingsQuery} />
            </SidebarContent>
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
      {closed || desktopMac ? (
        <ShellControls overContent={closed} onToggleSidebar={toggleSidebar} />
      ) : null}
    </>
  );
}

/**
 * The controls in the top-left corner: the sidebar's toggle, the back and
 * forward arrows a desktop window has no browser toolbar to supply, and a way
 * to start a session while the sidebar that holds one is shut.
 *
 * In a browser they appear only while the sidebar is closed, standing in for
 * its header. In the macOS desktop window they are always there, beside the
 * window controls, and double as the handle the window is dragged by.
 *
 * `overContent` says they are over the page rather than over the open
 * sidebar. A page with a header row of its own then makes room for them in it,
 * and a page without one moves down to clear them; globals.css arranges both,
 * keyed on this slot.
 */
function ShellControls({
  overContent,
  onToggleSidebar,
}: {
  overContent: boolean;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();
  const desktop = useDesktop();
  const button =
    "text-ink-02 hover:bg-tint-02 hover:text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors";

  return (
    <div
      data-slot="shell-controls"
      data-over-content={overContent}
      className="animate-in fade-in fixed top-0 left-0 z-20 flex h-shell items-center gap-0.5 pl-3 duration-200"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle sidebar"
              className={button}
            />
          }
        >
          <PanelLeftIcon className="size-4.5" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
      </Tooltip>
      {desktop ? (
        <>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className={button}
          >
            <ArrowLeftIcon className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => router.forward()}
            aria-label="Forward"
            className={button}
          >
            <ArrowRightIcon className="size-4.5" />
          </button>
        </>
      ) : null}
      {overContent ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link href="/chat" aria-label="New session" className={button} />
            }
          >
            <SquarePenIcon className="size-4.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">New session</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
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
        offset === "right" && "translate-x-full",
      )}
      aria-hidden={hidden}
      inert={hidden}
    >
      {children}
    </div>
  );
}
