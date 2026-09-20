/**
 * The local window's sidebar, built from the same parts as the dashboard's
 * (`apps/dashboard/src/components/app-sidebar.tsx`) so it opens and closes
 * the same way: gone entirely when closed, with the controls that
 * bring it back in the top-left corner (see shell-controls.tsx).
 *
 * Settings is not a separate layout. As in the dashboard, the main menu and
 * the settings menu are two panes stacked in one clipping frame that slide as
 * a pair, so opening Settings reads as stepping sideways rather than as a new
 * screen, and "Back to app" steps back.
 *
 * The settings pane is the shared one (`@onirix/ui`'s SettingsMenu), so its
 * rows and groups are the dashboard's. A page that needs a server still has
 * its row; the page says what it needs.
 */
import {
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  SettingsIcon,
  SquarePenIcon,
  Trash2Icon,
} from "@onirix/ui/lib/icons";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";
import { Button } from "@onirix/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@onirix/ui/components/dropdown-menu";
import { SettingsMenu } from "@onirix/ui/components/settings-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@onirix/ui/components/tooltip";

import { cn } from "@onirix/ui/lib/utils";

import { type ChatSummary, LIMITS } from "../src/local-bridge";

import { Modal, ModalDescription, ModalTitle } from "@onirix/ui/components/modal";
import type { SettingsPage } from "@onirix/ui/lib/settings-nav";


export function LocalSidebar({
  mac,
  chats,
  activeChatId,
  settingsPage,
  onNewSession,
  onOpenChat,
  onOpenSettings,
  onBackToApp,
  onRename,
  onDelete,
}: {
  /** On macOS the toggle is on the window's top row, not in this header. */
  mac: boolean;
  chats: ChatSummary[];
  activeChatId: string | null;
  /** The settings page on screen, or null when the app itself is. */
  settingsPage: SettingsPage | null;
  onNewSession: () => void;
  onOpenChat: (id: string) => void;
  onOpenSettings: (page: SettingsPage) => void;
  onBackToApp: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { toggleSidebar } = useSidebar();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const inSettings = settingsPage !== null;

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Pane hidden={inSettings} offset={inSettings ? "left" : "none"}>
            <SidebarHeader>
              <div className="flex h-8 items-center justify-between">
                <OnirixWordmark />
                {mac ? null : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={toggleSidebar}
                          aria-label="Close sidebar"
                          className="text-ink-02 hover:bg-sidebar-accent hover:text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none"
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

            <SidebarContent>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={!inSettings && activeChatId === null}
                      onClick={onNewSession}
                    >
                      <SquarePenIcon />
                      <span>New Session</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Recents</SidebarGroupLabel>
                {chats.length === 0 ? (
                  <p className="text-ink-02 px-2 py-1 text-xs">Your chats will appear here.</p>
                ) : (
                  <SidebarMenu>
                    {chats.map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        {renaming === chat.id ? (
                          <RenameField
                            initial={chat.title}
                            onDone={(title) => {
                              setRenaming(null);
                              if (title && title !== chat.title) onRename(chat.id, title);
                            }}
                          />
                        ) : (
                          <>
                            <SidebarMenuButton
                              isActive={!inSettings && activeChatId === chat.id}
                              onClick={() => onOpenChat(chat.id)}
                            >
                              <span>{chat.title}</span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <SidebarMenuAction
                                    showOnHover
                                    aria-label={`Options for ${chat.title}`}
                                  />
                                }
                              >
                                <MoreHorizontalIcon />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start" className="w-36">
                                <DropdownMenuItem onClick={() => setRenaming(chat.id)}>
                                  <PencilIcon /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleting(chat)}
                                >
                                  <Trash2Icon /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onOpenSettings("general")}>
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Pane>

          <Pane hidden={!inSettings} offset={inSettings ? "none" : "right"}>
            {/* The dashboard's settings pane, row for row. */}
            <SettingsMenu
              active={settingsPage}
              desktop
              toggle={!mac}
              onBack={onBackToApp}
              onOpen={onOpenSettings}
            />
          </Pane>
        </div>

      </Sidebar>

      <Modal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        className="w-[400px] gap-4 p-5"
        showCloseButton={false}
      >
        <div className="flex flex-col gap-1.5">
          <ModalTitle className="text-base font-semibold">Delete this chat?</ModalTitle>
          <ModalDescription className="text-ink-03">
            {deleting ? `"${deleting.title}" will be removed from this computer.` : ""} This cannot
            be undone.
          </ModalDescription>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="rounded-full px-4" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full px-4"
            onClick={() => {
              if (deleting) onDelete(deleting.id);
              setDeleting(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** The row, turned into a field. Enter or leaving it saves; Escape does not. */
function RenameField({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  // Removing the field blurs it, and a blur saves. Without this, Escape would
  // cancel and then save on its way out.
  const settled = useRef(false);

  function finish(title: string | null) {
    if (settled.current) return;
    settled.current = true;
    onDone(title);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") finish(value.trim());
    if (event.key === "Escape") finish(null);
  }

  return (
    <input
      autoFocus
      value={value}
      maxLength={LIMITS.titleChars}
      aria-label="Chat name"
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(value.trim())}
      onKeyDown={onKeyDown}
      className="bg-background border-ring h-8 w-full rounded-lg border px-2 text-sm outline-none select-text"
    />
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
      data-slot="sidebar-pane"
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
