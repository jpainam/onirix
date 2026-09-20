"use client"

// The settings pane of the sidebar: the way out, a search, and the grouped
// rows of `lib/settings-nav`. Shared by the dashboard and the desktop app's
// local mode, so it knows nothing about how either one navigates: a row is a
// button that reports its page, or whatever element `link` hands back for it.

import * as React from "react"
import { ArrowLeftIcon, PanelLeftIcon, SearchIcon } from "@onirix/ui/lib/icons"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@onirix/ui/components/input-group"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@onirix/ui/components/sidebar"
import {
  SETTINGS_SECTIONS,
  filterSettings,
  type SettingsItem,
  type SettingsPage,
} from "@onirix/ui/lib/settings-nav"

export function SettingsMenu({
  active,
  desktop,
  toggle,
  back,
  onBack,
  link,
  onOpen,
}: {
  /** The page on screen, or null while the app itself is. */
  active: SettingsPage | null
  /** Inside the desktop window, which is where `desktopOnly` rows belong. */
  desktop: boolean
  /**
   * Whether this pane carries the button that closes the sidebar. Off in the
   * macOS window, where that button sits beside the window controls instead.
   */
  toggle: boolean
  /** The element "Back to app" renders as, for an app that navigates by link. */
  back?: React.ReactElement
  onBack?: () => void
  /** The element a row renders as, for an app that navigates by link. */
  link?: (item: SettingsItem) => React.ReactElement
  onOpen?: (page: SettingsPage) => void
}) {
  const { toggleSidebar } = useSidebar()
  const [query, setQuery] = React.useState("")

  const sections = filterSettings(
    SETTINGS_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => desktop || !item.desktopOnly),
    })).filter((section) => section.items.length > 0),
    query
  )

  return (
    <>
      {/* The way out comes first, where the eye lands as the menu slides in,
          and the search under it narrows the rows below. */}
      <SidebarHeader className="gap-2 px-1">
        <div className="flex items-center gap-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={back} onClick={onBack}>
                <ArrowLeftIcon />
                <span>Back to app</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {toggle ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Close sidebar"
              className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-02 transition-colors hover:bg-sidebar-accent hover:text-ink-04 motion-reduce:transition-none"
            >
              <PanelLeftIcon className="size-4.5" />
            </button>
          ) : null}
        </div>
        <div className="px-1">
          <InputGroup className="h-8 bg-background">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
            />
          </InputGroup>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-02">
            No setting matches that.
          </p>
        ) : (
          sections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={active === item.page}
                      tooltip={item.title}
                      render={link?.(item)}
                      onClick={onOpen ? () => onOpen(item.page) : undefined}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>
    </>
  )
}
