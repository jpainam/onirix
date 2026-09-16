"use client";

import {
  BookOpenIcon,
  BuildingIcon,
  CpuIcon,
  DatabaseIcon,
  HistoryIcon,
  PaletteIcon,
  PieChartIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";
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
 * than as a link into an empty page.
 */
const ADMIN_SECTIONS = [
  {
    label: null,
    items: [{ title: "Language Models", url: "/admin/language-models", icon: CpuIcon }],
  },
  {
    label: "Documents & Knowledge",
    items: [
      { title: "Sources", url: "/admin/sources", icon: DatabaseIcon },
      { title: "Knowledge", url: "/admin/knowledge", icon: BookOpenIcon },
    ],
  },
  {
    label: "Permissions",
    items: [{ title: "Users & Teams", url: "/admin/users", icon: UsersIcon }],
  },
  {
    label: "Organization",
    items: [
      { title: "General", url: "/admin/organization", icon: BuildingIcon },
      { title: "Appearance & Theming", url: "/admin/appearance", icon: PaletteIcon },
      { title: "Security", icon: ShieldIcon },
    ],
  },
  {
    label: "Usage",
    items: [
      { title: "Usage", icon: PieChartIcon },
      { title: "Query History", icon: HistoryIcon },
    ],
  },
] as const;

export function AdminNav({ pathname }: { pathname: string }) {
  return (
    <>
      {ADMIN_SECTIONS.map((section, index) => (
        <SidebarGroup key={section.label ?? `section-${index}`}>
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarMenu>
            {section.items.map((item) =>
              "url" in item ? (
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
              ) : (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    aria-disabled
                    tooltip={`${item.title}: coming soon`}
                    className="cursor-default"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
