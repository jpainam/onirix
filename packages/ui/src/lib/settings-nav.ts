/**
 * The settings menu: what the sidebar lists when it slides over to Settings.
 *
 * One list for both apps. The dashboard turns each page into a route, the
 * desktop app's local mode into a page of its own window, and someone who
 * knows one finds the same rows in the same groups in the other.
 *
 * A row that cannot work where it is shown is still a row when its page can
 * say what it needs: local mode opens a workspace page with the form that
 * connects a server (`needsServer`). The one exception is `desktopOnly`: a
 * browser tab has no server to switch away from, so the row is left out there.
 */
import {
  BlocksIcon,
  BookOpenIcon,
  BuildingIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  FilesIcon,
  HistoryIcon,
  InfoIcon,
  LockIcon,
  type LucideIcon,
  NetworkIcon,
  PaletteIcon,
  PieChartIcon,
  ServerIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "@onirix/ui/lib/icons"

export const SETTINGS_PAGES = [
  "general",
  "appearance",
  "model",
  "local-models",
  "documents",
  "skills",
  "sources",
  "knowledge",
  "users",
  "teams",
  "roles",
  "organization",
  "security",
  "usage",
  "query-history",
  "server",
  "about",
] as const
export type SettingsPage = (typeof SETTINGS_PAGES)[number]

export type SettingsItem = {
  page: SettingsPage
  title: string
  icon: LucideIcon
  /**
   * Set on a page that only exists in a workspace: what it is for, in one
   * sentence. Local mode shows it above the form that connects a server.
   */
  needsServer?: string
  /** Only means something inside the desktop window. */
  desktopOnly?: boolean
}

export type SettingsSection = { label: string; items: SettingsItem[] }

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: "Personal",
    items: [
      { page: "general", title: "General", icon: SlidersHorizontalIcon },
      { page: "appearance", title: "Appearance", icon: PaletteIcon },
    ],
  },
  {
    label: "Model",
    items: [
      { page: "model", title: "Language model", icon: CpuIcon },
      { page: "local-models", title: "Open models", icon: DownloadIcon },
    ],
  },
  {
    label: "Documents & Knowledge",
    items: [
      { page: "documents", title: "Documents", icon: FilesIcon },
      { page: "skills", title: "Skills", icon: BlocksIcon },
      {
        page: "sources",
        title: "Sources",
        icon: DatabaseIcon,
        needsServer:
          "Sources bring in knowledge from shared drives, connectors and databases, and keep it indexed.",
      },
      {
        page: "knowledge",
        title: "Knowledge",
        icon: BookOpenIcon,
        needsServer:
          "Knowledge groups what a workspace has indexed into collections.",
      },
    ],
  },
  {
    label: "Permissions",
    items: [
      {
        page: "users",
        title: "Users",
        icon: UsersIcon,
        needsServer:
          "Users are the people of a workspace. This app, on its own, has one: you.",
      },
      {
        page: "teams",
        title: "Teams",
        icon: NetworkIcon,
        needsServer: "Teams decide who can read which documents in a workspace.",
      },
      {
        page: "roles",
        title: "Roles",
        icon: ShieldIcon,
        needsServer: "Roles decide what each person in a workspace may change.",
      },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        page: "organization",
        title: "Organization",
        icon: BuildingIcon,
        needsServer: "An organization's name and details belong to its workspace.",
      },
      {
        page: "security",
        title: "Security",
        icon: LockIcon,
        needsServer:
          "Sign-in rules and sessions are a workspace's. Nothing signs in to this app on its own.",
      },
    ],
  },
  {
    label: "Usage",
    items: [
      {
        page: "usage",
        title: "Usage",
        icon: PieChartIcon,
        needsServer: "Usage reports what a workspace's people ask and what it costs.",
      },
      {
        page: "query-history",
        title: "Query History",
        icon: HistoryIcon,
        needsServer:
          "Query history is a workspace's record of the questions asked of it.",
      },
    ],
  },
  {
    label: "Connection",
    items: [
      { page: "server", title: "Server", icon: ServerIcon, desktopOnly: true },
    ],
  },
  {
    label: "About",
    items: [{ page: "about", title: "About Onirix", icon: InfoIcon }],
  },
]

/**
 * The sections with the rows a search leaves. A row stays when its own title
 * or its group's label matches, and a group that loses every row goes with
 * them, label and all.
 */
export function filterSettings(
  sections: SettingsSection[],
  query: string
): SettingsSection[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return sections
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          section.label.toLowerCase().includes(needle)
      ),
    }))
    .filter((section) => section.items.length > 0)
}

function settingsItem(page: SettingsPage): SettingsItem | undefined {
  for (const section of SETTINGS_SECTIONS) {
    const item = section.items.find((entry) => entry.page === page)
    if (item) return item
  }
  return undefined
}

export function settingsTitle(page: SettingsPage): string {
  return settingsItem(page)?.title ?? "Settings"
}

/** What a server-only page says it is for, or null for a page that works here. */
export function serverOnlyReason(page: SettingsPage): string | null {
  return settingsItem(page)?.needsServer ?? null
}
