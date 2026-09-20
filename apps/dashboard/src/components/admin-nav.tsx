import type { Route } from "next";

import { SETTINGS_PAGES, type SettingsPage } from "@onirix/ui/lib/settings-nav";

/**
 * Where each row of the settings menu lives in this app.
 *
 * The menu itself, its groups and its wording are `@onirix/ui`'s, shared with
 * the desktop app's local mode; all this app adds is a route per page. The
 * paths stay under `/admin` whatever group a row is listed in, so moving a row
 * between groups never breaks a link someone kept.
 */
export const SETTINGS_ROUTES: Record<SettingsPage, Route> = {
  general: "/admin/general",
  appearance: "/admin/appearance",
  model: "/admin/language-models",
  "local-models": "/admin/open-models",
  documents: "/admin/documents",
  skills: "/admin/skills",
  sources: "/admin/sources",
  knowledge: "/admin/knowledge",
  users: "/admin/users",
  teams: "/admin/teams",
  roles: "/admin/roles",
  organization: "/admin/organization",
  security: "/admin/security",
  usage: "/admin/usage",
  "query-history": "/admin/query-history",
  server: "/admin/server",
  about: "/admin/about",
};

/** Where the Settings entry lands; `/admin` also decides which menu shows. */
export const SETTINGS_HOME = SETTINGS_ROUTES.general;

/** The settings page a path belongs to, detail pages under it included. */
export function settingsPageAt(pathname: string): SettingsPage | null {
  return (
    SETTINGS_PAGES.find(
      (page) =>
        pathname === SETTINGS_ROUTES[page] ||
        pathname.startsWith(`${SETTINGS_ROUTES[page]}/`),
    ) ?? null
  );
}
