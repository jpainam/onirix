/**
 * The settings menu: what the sidebar lists when it slides over to Settings,
 * and what each page is called in the header row.
 *
 * The shape is the dashboard's admin menu and Synara's settings menu (grouped
 * rows under small labels). The entries are Onirix's own, and every one of
 * them is a page that does something in local mode: nothing is listed that
 * would only say "connect a server first".
 */
import {
  CpuIcon,
  DownloadIcon,
  FilesIcon,
  InfoIcon,
  type LucideIcon,
  PaletteIcon,
  ServerIcon,
  SlidersHorizontalIcon,
} from "@onirix/ui/lib/icons";

export const SETTINGS_PAGES = [
  "general",
  "appearance",
  "model",
  "local-models",
  "documents",
  "server",
  "about",
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export type SettingsItem = { page: SettingsPage; title: string; icon: LucideIcon };

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
    label: "Knowledge",
    items: [{ page: "documents", title: "Documents", icon: FilesIcon }],
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

export function settingsTitle(page: SettingsPage): string {
  for (const section of SETTINGS_SECTIONS) {
    const item = section.items.find((entry) => entry.page === page);
    if (item) return item.title;
  }
  return "Settings";
}
