"use client";

import {
  BlocksIcon,
  BookOpenIcon,
  BuildingIcon,
  CpuIcon,
  DatabaseIcon,
  HistoryIcon,
  LockIcon,
  NetworkIcon,
  PaletteIcon,
  PieChartIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@onirix/ui/components/sidebar";

/**
 * The admin menu, grouped the way the product spec splits administration.
 *
 * Sections are filled in progressively: an item without a `url` is a surface
 * the spec calls for but nothing implements yet, so it renders dimmed rather
 * than as a link into an empty page. The type is written out rather than
 * inferred from `as const` so that stays true when every current item happens
 * to have one.
 */
type AdminItem = { title: string; url?: Route; icon: LucideIcon };

const ADMIN_SECTIONS: { label: string | null; items: AdminItem[] }[] = [
  {
    label: null,
    items: [{ title: "Language Models", url: "/admin/language-models", icon: CpuIcon }],
  },
  {
    label: "Documents & Knowledge",
    items: [
      { title: "Sources", url: "/admin/sources", icon: DatabaseIcon },
      { title: "Knowledge", url: "/admin/knowledge", icon: BookOpenIcon },
      { title: "Skills", url: "/admin/skills", icon: BlocksIcon },
    ],
  },
  {
    label: "Permissions",
    items: [
      { title: "Users", url: "/admin/users", icon: UsersIcon },
      { title: "Teams", url: "/admin/teams", icon: NetworkIcon },
      { title: "Roles", url: "/admin/roles", icon: ShieldIcon },
    ],
  },
  {
    label: "Organization",
    items: [
      { title: "General", url: "/admin/organization", icon: BuildingIcon },
      { title: "Appearance", url: "/admin/appearance", icon: PaletteIcon },
      { title: "Security", url: "/admin/security", icon: LockIcon },
    ],
  },
  {
    label: "Usage",
    items: [
      { title: "Usage", url: "/admin/usage", icon: PieChartIcon },
      { title: "Query History", url: "/admin/query-history", icon: HistoryIcon },
    ],
  },
];

export function AdminNav({ pathname }: { pathname: string }) {
  return (
    <>
      {ADMIN_SECTIONS.map((section, index) => (
        <SidebarGroup key={section.label ?? `section-${index}`}>
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarMenu>
            {section.items.map((item) => (
              <SidebarMenuItem key={item.title}>
                {item.url ? (
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
                ) : (
                  <SidebarMenuButton
                    aria-disabled
                    tooltip={`${item.title}: coming soon`}
                    className="cursor-default"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
