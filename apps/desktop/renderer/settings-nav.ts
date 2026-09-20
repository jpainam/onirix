/**
 * The settings menu: what the sidebar lists when it slides over to Settings,
 * and what each page is called in the header row.
 *
 * The shape is the dashboard's admin menu and Synara's settings menu (grouped
 * rows under small labels), and so is the list: someone who knows the
 * workspace finds the same rows here. A row that cannot work without a server
 * is still a row. Its page opens, says what it needs, and offers the way to
 * get it (`needsServer`), which is a better place to learn that than a menu
 * with the row missing.
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
} from "@onirix/ui/lib/icons";

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
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export type SettingsItem = {
  page: SettingsPage;
  title: string;
  icon: LucideIcon;
  /**
   * Set on a page that only exists in a workspace: what it is for, in one
   * sentence. The page shows it above the form that connects a server.
   */
  needsServer?: string;
};

export const SETTINGS_SECTIONS: { label: string; items: SettingsItem[] }[] = [
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
      { page: "local-models", title: "Local models", icon: DownloadIcon },
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
        needsServer: "Knowledge groups what a workspace has indexed into collections.",
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
        needsServer: "Users are the people of a workspace. This app, on its own, has one: you.",
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
        needsServer: "Sign-in rules and sessions are a workspace's. Nothing signs in to this app on its own.",
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
        needsServer: "Query history is a workspace's record of the questions asked of it.",
      },
    ],
  },
  {
    label: "Connection",
    items: [{ page: "server", title: "Server", icon: ServerIcon }],
  },
  {
    label: "About",
    items: [{ page: "about", title: "About Onirix", icon: InfoIcon }],
  },
];

function settingsItem(page: SettingsPage): SettingsItem | undefined {
  for (const section of SETTINGS_SECTIONS) {
    const item = section.items.find((entry) => entry.page === page);
    if (item) return item;
  }
  return undefined;
}

export function settingsTitle(page: SettingsPage): string {
  return settingsItem(page)?.title ?? "Settings";
}

/** What a server-only page says it is for, or null for a page that works here. */
export function serverOnlyReason(page: SettingsPage): string | null {
  return settingsItem(page)?.needsServer ?? null;
}
